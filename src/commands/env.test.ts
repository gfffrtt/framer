import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ignoreCustomEnvFiles, planEnv } from "./env.ts";
import type { ProjectConfig } from "../config.ts";
import { runSteps } from "../steps.ts";
import { memoryBackend } from "../testing/memory-backend.ts";

const config: ProjectConfig = { name: "acme", environments: ["dev", "staging", "prod"], backend: { type: "google-drive" } };

let root: string;
let memory: ReturnType<typeof memoryBackend>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "framer-env-"));
  memory = memoryBackend();
  await Bun.write(join(root, "apps", "web", "framer.json"), "{}");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function env(type: "app" | "bucket", name = "web") {
  const plan = await planEnv({ root, config, type, name, backend: memory.backend });
  await runSteps(plan.steps);
  return plan;
}

test("pushes each .env.<env> file to the entity's env file in the backend", async () => {
  await Bun.write(join(root, "apps", "web", ".env.dev"), "RESEND_API_KEY=re_dev\n");
  await Bun.write(join(root, "apps", "web", ".env.prod"), "RESEND_API_KEY=re_prod\nFROM=\"hi@acme.com\"\n");
  await Bun.write(join(root, "apps", "web", ".env.undeclared"), "IGNORED=1\n");
  memory.files["acme/apps/web/staging.env"] = { KEPT: "1" };
  memory.files["acme/apps/web/prod.env"] = { REMOVED: "1" };

  const { pushed, skipped } = await env("app");

  expect(pushed).toEqual([
    { env: "dev", keys: ["RESEND_API_KEY"] },
    { env: "prod", keys: ["RESEND_API_KEY", "FROM"] },
  ]);
  expect(skipped).toEqual(["staging"]);
  expect(memory.files["acme/apps/web/dev.env"]).toEqual({ RESEND_API_KEY: "re_dev" });
  expect(memory.files["acme/apps/web/prod.env"]).toEqual({ RESEND_API_KEY: "re_prod", FROM: "hi@acme.com" });
  expect(memory.files["acme/apps/web/staging.env"]).toEqual({ KEPT: "1" });
  // Generated envs are untouched.
  expect(memory.files["acme/prod.env"]).toBeUndefined();
});

test("refuses entity types without custom envs, missing entities and missing files", async () => {
  await expect(env("bucket", "uploads")).rejects.toThrow("buckets have no custom envs. Only apps, jobs, tasks do.");
  await expect(env("app", "api")).rejects.toThrow('apps/api doesn\'t exist. Run "framer add app api" first.');
  await expect(env("app")).rejects.toThrow("Looked for apps/web/.env.dev, apps/web/.env.staging, apps/web/.env.prod");
});

test("makes git ignore custom env files", async () => {
  expect(await ignoreCustomEnvFiles(root, "apps/web")).toBe(false); // not a git repo

  await Bun.$`git init -q`.cwd(root);
  await Bun.write(join(root, ".gitignore"), "node_modules\n.env");
  expect(await ignoreCustomEnvFiles(root, "apps/web")).toBe(true);
  expect(await Bun.file(join(root, ".gitignore")).text()).toBe("node_modules\n.env\n.env.*\n!.env.example\n");
  expect(await ignoreCustomEnvFiles(root, "apps/web")).toBe(false);
});
