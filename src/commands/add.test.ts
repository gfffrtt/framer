import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { exists, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planAdd, runCreateCommand } from "./add.ts";
import type { ProjectConfig } from "../config.ts";
import { newEntity, type EntityType } from "../entities.ts";
import { appOnVercel } from "../provisioners/app-vercel.ts";
import { bucketOnCloudflare } from "../provisioners/bucket-cloudflare.ts";
import type { Connection, Provisioner } from "../provisioners/index.ts";
import { runSteps } from "../steps.ts";
import { fakeCloudflare } from "../testing/fake-cloudflare.ts";
import { fakeVercel } from "../testing/fake-vercel.ts";
import { memoryBackend } from "../testing/memory-backend.ts";

const config: ProjectConfig = { name: "acme", environments: ["dev", "prod"], backend: { type: "google-drive" } };

let root: string;
let memory: ReturnType<typeof memoryBackend>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "framer-add-"));
  memory = memoryBackend();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function add(type: EntityType, name: string, provisioner: Provisioner, connections: Record<string, Connection>) {
  const entity = await newEntity(root, type, name);
  const { steps } = await planAdd({ root, config, entity, provisioner, connections, backend: memory.backend });
  await runSteps(steps);
  return entity;
}

/** Both environments on the same fake account. */
function bucketConnections(fetch: typeof globalThis.fetch) {
  const connection = bucketOnCloudflare.connect({ token: "t", scope: "acc" }, fetch);
  return { dev: connection, prod: connection };
}

function appConnections(fetch: typeof globalThis.fetch) {
  const connection = appOnVercel.connect({ token: "t", scope: "team" }, fetch);
  return { dev: connection, prod: connection };
}

test("provisions a bucket per environment and stores its envs in the backend", async () => {
  const cf = fakeCloudflare();
  memory.files["acme/dev.env"] = { EXISTING: "kept" };

  const { dir } = await add("bucket", "uploads", bucketOnCloudflare, bucketConnections(cf.fetch));

  expect(cf.buckets).toEqual(["acme-uploads-dev", "acme-uploads-prod"]);
  expect(cf.tokens.map((token) => token.name)).toEqual([
    "framer-buckets-acme-uploads-dev",
    "framer-buckets-acme-uploads-prod",
  ]);
  expect(cf.tokens.map((token) => token.resources)).toEqual([
    ["com.cloudflare.edge.r2.bucket.acc_default_acme-uploads-dev"],
    ["com.cloudflare.edge.r2.bucket.acc_default_acme-uploads-prod"],
  ]);

  expect(memory.files["acme/dev.env"]).toEqual({
    EXISTING: "kept",
    BUCKET_UPLOADS_NAME: "acme-uploads-dev",
    BUCKET_UPLOADS_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
    BUCKET_UPLOADS_ACCESS_KEY_ID: "key-1",
    BUCKET_UPLOADS_SECRET_ACCESS_KEY: createHash("sha256").update("secret-1").digest("hex"),
  });
  expect(memory.files["acme/prod.env"]?.BUCKET_UPLOADS_NAME).toBe("acme-uploads-prod");

  expect(dir).toBe(join(root, "buckets", "uploads"));
  expect(await Bun.file(join(dir, "framer.json")).json()).toEqual({
    cloud: "cloudflare",
    envs: [
      "BUCKET_UPLOADS_NAME",
      "BUCKET_UPLOADS_ENDPOINT",
      "BUCKET_UPLOADS_ACCESS_KEY_ID",
      "BUCKET_UPLOADS_SECRET_ACCESS_KEY",
    ],
  });
  expect(await exists(join(dir, "dev.json"))).toBe(false);
});

test("leaves no entity behind when provisioning fails", async () => {
  const cf = fakeCloudflare({ fail: true });
  await expect(add("bucket", "uploads", bucketOnCloudflare, bucketConnections(cf.fetch))).rejects.toThrow("nope");
  expect(await exists(join(root, "buckets", "uploads"))).toBe(false);
});

test("names the scoped key whose token was rejected", async () => {
  const cf = fakeCloudflare({ reject: true });
  await expect(add("bucket", "uploads", bucketOnCloudflare, bucketConnections(cf.fetch))).rejects.toThrow(
    "CLOUDFLARE_API_TOKEN_DEV_BUCKETS_UPLOADS: Cloudflare rejected the token.",
  );
});

test("refuses too-long resource names before creating anything", async () => {
  const cf = fakeCloudflare();
  await expect(add("bucket", "x".repeat(60), bucketOnCloudflare, bucketConnections(cf.fetch))).rejects.toThrow(
    "longer than 63",
  );
  expect(cf.buckets).toEqual([]);
});

test("uses each environment's own credentials", async () => {
  const cf = fakeCloudflare();
  await add("bucket", "uploads", bucketOnCloudflare, {
    dev: bucketOnCloudflare.connect({ token: "dev-token", scope: "acc" }, cf.fetch),
    prod: bucketOnCloudflare.connect({ token: "prod-token", scope: "acc" }, cf.fetch),
  });
  expect(cf.tokens.map(({ name, token }) => [name, token])).toEqual([
    ["framer-buckets-acme-uploads-dev", "dev-token"],
    ["framer-buckets-acme-uploads-prod", "prod-token"],
  ]);

  await expect(
    add("bucket", "files", bucketOnCloudflare, { dev: bucketOnCloudflare.connect({ token: "t", scope: "acc" }, cf.fetch) }),
  ).rejects.toThrow('No Cloudflare credentials for environment "prod"');
});

async function writeApp() {
  const dir = join(root, "apps", "web");
  await mkdir(join(dir, "node_modules", "dep"), { recursive: true });
  await Bun.write(join(dir, "package.json"), '{ "name": "web" }\n');
  await Bun.write(join(dir, "src", "index.html"), "<h1>hi</h1>\n");
  await Bun.write(join(dir, "node_modules", "dep", "index.js"), "ignored\n");
  await Bun.write(join(dir, ".env"), "SECRET=ignored\n");
  return dir;
}

test("deploys an app per environment with the other entities' envs", async () => {
  const vercel = fakeVercel();
  await writeApp();
  await Bun.write(join(root, "buckets", "uploads", "framer.json"), JSON.stringify({ cloud: "cloudflare", envs: ["BUCKET_UPLOADS_NAME"] }));
  memory.files["acme/dev.env"] = { BUCKET_UPLOADS_NAME: "acme-uploads-dev", UNRELATED: "not pushed" };
  memory.files["acme/prod.env"] = { BUCKET_UPLOADS_NAME: "acme-uploads-prod" };
  // Custom envs pushed with `framer env`; they win over generated ones.
  memory.files["acme/apps/web/prod.env"] = { RESEND_API_KEY: "re_prod", BUCKET_UPLOADS_NAME: "override" };

  const { dir } = await add("app", "web", appOnVercel, appConnections(vercel.fetch));

  // prod already existed, so only dev is created.
  expect(vercel.created).toEqual(["acme-web-dev"]);
  expect(vercel.env["prj-acme-web-dev"]).toEqual([
    { key: "BUCKET_UPLOADS_NAME", value: "acme-uploads-dev", type: "encrypted", target: ["production", "preview", "development"] },
  ] as never);
  expect(vercel.env["prj-acme-web-prod"]?.map(({ key, value }) => [key, value])).toEqual([
    ["BUCKET_UPLOADS_NAME", "override"],
    ["RESEND_API_KEY", "re_prod"],
  ]);

  expect(vercel.deployments.map((deployment) => deployment.project)).toEqual(["acme-web-dev", "acme-web-prod"]);
  const files = vercel.deployments[0]!.files;
  expect(files.map((file) => file.file)).toEqual(["package.json", "src/index.html"]);
  const sha = createHash("sha1").update("<h1>hi</h1>\n").digest("hex");
  expect(files[1]).toEqual({ file: "src/index.html", sha, size: 12 });
  expect(vercel.uploads[sha]).toBe("<h1>hi</h1>\n");

  expect(memory.files["acme/dev.env"]).toEqual({
    BUCKET_UPLOADS_NAME: "acme-uploads-dev",
    UNRELATED: "not pushed",
    APP_WEB_URL: "https://acme-web-dev.vercel.app",
  });
  expect(memory.files["acme/prod.env"]?.APP_WEB_URL).toBe("https://acme-web-prod.vercel.app");
  expect(await Bun.file(join(dir, "framer.json")).json()).toEqual({ cloud: "vercel", envs: ["APP_WEB_URL"] });
});

test("a failed deployment leaves the app's code but no entity config", async () => {
  const vercel = fakeVercel({ fail: true });
  const dir = await writeApp();
  await expect(add("app", "web", appOnVercel, appConnections(vercel.fetch))).rejects.toThrow("Build logs: https://vercel.com/logs");
  expect(await exists(join(dir, "package.json"))).toBe(true);
  expect(await exists(join(dir, "framer.json"))).toBe(false);
});

test("runs the create command inside the app folder and drops its git repo", async () => {
  const dir = join(root, "apps", "web");
  await runCreateCommand(dir, "echo '{}' > package.json && mkdir .git");
  expect(await Bun.file(join(dir, "package.json")).text()).toBe("{}\n");
  expect(await exists(join(dir, ".git"))).toBe(false);

  await expect(runCreateCommand(join(root, "apps", "api"), "true")).rejects.toThrow("created nothing");
  await expect(runCreateCommand(join(root, "apps", "api"), "exit 3")).rejects.toThrow("exit code 3");
  await expect(runCreateCommand(dir, "true")).rejects.toThrow("not empty");
});
