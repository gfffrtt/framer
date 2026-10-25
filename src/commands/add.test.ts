import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { exists, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { add, envPrefix } from "./add.ts";
import { cloudflare, listCloudflareAccounts } from "../clouds/cloudflare.ts";
import type { ProjectConfig } from "../config.ts";
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

/** A fake Cloudflare API. `fail` makes bucket creation fail. */
function fakeCloudflare(options: { fail?: boolean } = {}) {
  const buckets: string[] = [];
  const tokens: { name: string; resources: string[] }[] = [];
  const ok = (result: unknown, status = 200) =>
    Response.json({ success: status < 400, errors: status < 400 ? [] : [{ code: 1, message: "nope" }], result }, { status });

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/client/v4", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/accounts/acc/tokens/verify") return ok({ status: "active" });
    if (path === "/accounts/acc/r2/buckets" && init?.method === "POST") {
      if (options.fail) return ok(null, 500);
      if (buckets.includes(body.name)) return ok(null, 409);
      buckets.push(body.name);
      return ok({ name: body.name });
    }
    if (path === "/accounts/acc/tokens/permission_groups") {
      return ok([
        { id: "pg-read", name: "Workers R2 Storage Bucket Item Read" },
        { id: "pg-write", name: "Workers R2 Storage Bucket Item Write" },
      ]);
    }
    if (path === "/accounts/acc/tokens" && init?.method === "POST") {
      expect(body.policies[0].permission_groups).toEqual([{ id: "pg-write" }]);
      tokens.push({ name: body.name, resources: Object.keys(body.policies[0].resources) });
      return ok({ id: `key-${tokens.length}`, value: `secret-${tokens.length}` });
    }
    return ok(null, 404);
  }) as typeof fetch;

  return { client: cloudflare({ accountId: "acc", apiToken: "t", fetch: fetcher }), buckets, tokens };
}

test("provisions a bucket per environment and stores its envs in the backend", async () => {
  const cf = fakeCloudflare();
  memory.files["acme/dev.env"] = { EXISTING: "kept" };

  const dir = await add({ root, config, type: "bucket", name: "uploads", cloud: "cloudflare", backend: memory.backend, cloudflare: cf.client });

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
  await expect(
    add({ root, config, type: "bucket", name: "uploads", cloud: "cloudflare", backend: memory.backend, cloudflare: cf.client }),
  ).rejects.toThrow("nope");
  expect(await exists(join(root, "buckets", "uploads"))).toBe(false);
});

test("refuses an existing entity, bad names and too-long bucket names", async () => {
  const cf = fakeCloudflare();
  const options = { root, config, type: "bucket", cloud: "cloudflare", backend: memory.backend, cloudflare: cf.client } as const;

  await add({ ...options, name: "uploads" });
  await expect(add({ ...options, name: "uploads" })).rejects.toThrow("already exists");
  await expect(add({ ...options, name: "Uploads" })).rejects.toThrow("lowercase");
  await expect(add({ ...options, name: "x".repeat(60) })).rejects.toThrow("longer than 63");
});

test("env prefix", () => {
  expect(envPrefix("bucket", "user-files")).toBe("BUCKET_USER_FILES_");
});

test("lists the accounts a Cloudflare token can access", async () => {
  const fetcher = (async () =>
    Response.json({ success: true, errors: [], result: [{ id: "acc", name: "Acme", extra: 1 }] })) as unknown as typeof fetch;
  expect(await listCloudflareAccounts("t", fetcher)).toEqual([{ id: "acc", name: "Acme" }]);

  const failing = (async () => Response.json({ success: false, errors: [] }, { status: 403 })) as unknown as typeof fetch;
  expect(await listCloudflareAccounts("t", failing)).toEqual([]);
});
