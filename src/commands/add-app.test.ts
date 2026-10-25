import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { exists, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { add, runCreateCommand } from "./add.ts";
import { listVercelTeams, vercel } from "../clouds/vercel.ts";
import type { ProjectConfig } from "../config.ts";
import { entityEnvNames } from "../entities.ts";
import { memoryBackend } from "../testing/memory-backend.ts";

const config: ProjectConfig = { name: "acme", environments: ["dev", "prod"], backend: { type: "google-drive" } };

let root: string;
let memory: ReturnType<typeof memoryBackend>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "framer-add-app-"));
  memory = memoryBackend();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A fake Vercel API. `fail` makes every deployment end in ERROR. */
function fakeVercel(options: { fail?: boolean } = {}) {
  const projects: string[] = ["acme-web-prod"];
  const created: string[] = [];
  const env: Record<string, { key: string; value: string; target: string[] }[]> = {};
  const uploads: Record<string, string> = {};
  const deployments: { project: string; files: { file: string; sha: string; size: number }[]; polls: number }[] = [];

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("teamId")).toBe("team");
    const path = url.pathname;
    const method = init?.method ?? "GET";

    if (path === "/v2/user") return Response.json({ user: { id: "u" } });
    if (path.startsWith("/v9/projects/")) {
      const name = decodeURIComponent(path.split("/")[3]!);
      return projects.includes(name) ?
          Response.json({ id: `prj-${name}` })
        : Response.json({ error: { message: "not found" } }, { status: 404 });
    }
    if (path === "/v11/projects" && method === "POST") {
      const { name } = JSON.parse(String(init!.body));
      projects.push(name);
      created.push(name);
      return Response.json({ id: `prj-${name}`, name });
    }
    if (path.endsWith("/env") && method === "POST") {
      expect(url.searchParams.get("upsert")).toBe("true");
      env[path.split("/")[3]!] = JSON.parse(String(init!.body));
      return Response.json({ created: [], failed: [] }, { status: 201 });
    }
    if (path === "/v2/files") {
      const headers = new Headers(init!.headers);
      uploads[headers.get("x-vercel-digest")!] = Buffer.from(init!.body as Uint8Array).toString();
      return Response.json({});
    }
    if (path === "/v13/deployments" && method === "POST") {
      expect(url.searchParams.get("skipAutoDetectionConfirmation")).toBe("1");
      const body = JSON.parse(String(init!.body));
      expect(body.target).toBe("production");
      deployments.push({ project: body.name, files: body.files, polls: 0 });
      return Response.json({ id: `dpl-${deployments.length - 1}`, url: "x.vercel.app", readyState: "QUEUED" });
    }
    if (path.startsWith("/v13/deployments/")) {
      const id = path.split("/").at(-1)!;
      const deployment = deployments[Number(id.split("-")[1])]!;
      deployment.polls++;
      if (deployment.polls < 2) return Response.json({ id, url: "x.vercel.app", readyState: "BUILDING" });
      if (options.fail) {
        return Response.json({ id, url: "x", readyState: "ERROR", inspectorUrl: "https://vercel.com/logs" });
      }
      return Response.json({
        id,
        url: `${deployment.project}-abc123.vercel.app`,
        readyState: "READY",
        alias: [`${deployment.project}-team.vercel.app`, `${deployment.project}.vercel.app`],
      });
    }
    return Response.json({ error: { message: "unexpected" } }, { status: 500 });
  }) as typeof fetch;

  return { client: vercel({ teamId: "team", token: "t", fetch: fetcher, pollMs: 0 }), created, env, uploads, deployments };
}

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
  const cf = fakeVercel();
  await writeApp();
  await Bun.write(join(root, "buckets", "uploads", "framer.json"), JSON.stringify({ cloud: "cloudflare", envs: ["BUCKET_UPLOADS_NAME"] }));
  memory.files["acme/dev.env"] = { BUCKET_UPLOADS_NAME: "acme-uploads-dev", UNRELATED: "not pushed" };
  memory.files["acme/prod.env"] = { BUCKET_UPLOADS_NAME: "acme-uploads-prod" };
  // Custom envs pushed with `framer env`; they win over generated ones.
  memory.files["acme/apps/web/prod.env"] = { RESEND_API_KEY: "re_prod", BUCKET_UPLOADS_NAME: "override" };

  const dir = await add({ root, config, type: "app", name: "web", cloud: "vercel", clients: { dev: cf.client, prod: cf.client }, backend: memory.backend });

  // prod already existed, so only dev is created.
  expect(cf.created).toEqual(["acme-web-dev"]);
  expect(cf.env["prj-acme-web-dev"]).toEqual([
    { key: "BUCKET_UPLOADS_NAME", value: "acme-uploads-dev", type: "encrypted", target: ["production", "preview", "development"] },
  ] as never);
  expect(cf.env["prj-acme-web-prod"]?.map(({ key, value }) => [key, value])).toEqual([
    ["BUCKET_UPLOADS_NAME", "override"],
    ["RESEND_API_KEY", "re_prod"],
  ]);

  expect(cf.deployments.map((deployment) => deployment.project)).toEqual(["acme-web-dev", "acme-web-prod"]);
  const files = cf.deployments[0]!.files;
  expect(files.map((file) => file.file)).toEqual(["package.json", "src/index.html"]);
  const sha = createHash("sha1").update("<h1>hi</h1>\n").digest("hex");
  expect(files[1]).toEqual({ file: "src/index.html", sha, size: 12 });
  expect(cf.uploads[sha]).toBe("<h1>hi</h1>\n");

  expect(memory.files["acme/dev.env"]).toEqual({
    BUCKET_UPLOADS_NAME: "acme-uploads-dev",
    UNRELATED: "not pushed",
    APP_WEB_URL: "https://acme-web-dev.vercel.app",
  });
  expect(memory.files["acme/prod.env"]?.APP_WEB_URL).toBe("https://acme-web-prod.vercel.app");
  expect(await Bun.file(join(dir, "framer.json")).json()).toEqual({ cloud: "vercel", envs: ["APP_WEB_URL"] });
});

test("a failed deployment leaves the app's code but no entity config", async () => {
  const cf = fakeVercel({ fail: true });
  const dir = await writeApp();
  await expect(
    add({ root, config, type: "app", name: "web", cloud: "vercel", clients: { dev: cf.client, prod: cf.client }, backend: memory.backend }),
  ).rejects.toThrow("Build logs: https://vercel.com/logs");
  expect(await exists(join(dir, "package.json"))).toBe(true);
  expect(await exists(join(dir, "framer.json"))).toBe(false);
});

test("refuses a cloud the entity type can't go to", async () => {
  const cf = fakeVercel();
  await expect(
    add({ root, config, type: "bucket", name: "uploads", cloud: "vercel", clients: { dev: cf.client, prod: cf.client }, backend: memory.backend }),
  ).rejects.toThrow("can't provision buckets on vercel");
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

test("lists the env names of every other entity", async () => {
  await Bun.write(join(root, "buckets", "uploads", "framer.json"), JSON.stringify({ envs: ["BUCKET_UPLOADS_NAME"] }));
  await Bun.write(join(root, "apps", "web", "framer.json"), JSON.stringify({ envs: ["APP_WEB_URL"] }));
  expect((await entityEnvNames(root)).sort()).toEqual(["APP_WEB_URL", "BUCKET_UPLOADS_NAME"]);
  expect(await entityEnvNames(root, "apps/web")).toEqual(["BUCKET_UPLOADS_NAME"]);
});

test("lists the teams a Vercel token can access", async () => {
  const fetcher = (async () => Response.json({ teams: [{ id: "team", name: "Acme", slug: "acme" }] })) as unknown as typeof fetch;
  expect(await listVercelTeams("t", fetcher)).toEqual([{ id: "team", name: "Acme" }]);
});
