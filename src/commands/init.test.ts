import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, exists } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planInit, validateProjectName, type InitOptions } from "./init.ts";
import { ENTITY_DIRS } from "../entities.ts";
import { parseEnv } from "../dotenv.ts";
import { runSteps } from "../steps.ts";
import { memoryBackend } from "../testing/memory-backend.ts";

let cwd: string;
let memory: ReturnType<typeof memoryBackend>;
let backend: InitOptions["backend"];

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "framer-init-"));
  memory = memoryBackend();
  backend = { type: "google-drive", credentials: { GOOGLE_AUTH: "abc==" }, client: memory.backend };
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function init(options: InitOptions): Promise<string> {
  const { root, steps } = await planInit(options);
  await runSteps(steps);
  return root;
}

test("scaffolds an empty turborepo with framer.json and entity folders", async () => {
  const root = await init({ name: "acme", cwd, install: false, git: false, backend });

  expect(await Bun.file(join(root, "framer.json")).json()).toEqual({
    name: "acme",
    environments: ["prod"],
    backend: { type: "google-drive" },
  });

  const pkg = await Bun.file(join(root, "package.json")).json();
  expect(pkg.name).toBe("acme");
  expect(pkg.workspaces).toEqual(ENTITY_DIRS.map((dir) => `${dir}/*`));
  expect(pkg.devDependencies.turbo).toBeDefined();

  const turbo = await Bun.file(join(root, "turbo.json")).json();
  expect(Object.keys(turbo.tasks)).toContain("build");

  for (const dir of ENTITY_DIRS) {
    expect(await exists(join(root, dir))).toBe(true);
  }
});

test("uses the first environment the user chose", async () => {
  const root = await init({ name: "acme", environment: "staging", cwd, install: false, git: false, backend });
  expect((await Bun.file(join(root, "framer.json")).json()).environments).toEqual(["staging"]);
  await expect(init({ name: "other", environment: "Prod!", cwd, install: false, git: false, backend })).rejects.toThrow(
    "Environment name",
  );
});

test("saves backend credentials to the root .env and creates the project in the backend", async () => {
  const root = await init({ name: "acme", cwd, install: false, git: false, backend });

  expect(parseEnv(await Bun.file(join(root, ".env")).text())).toEqual({ GOOGLE_AUTH: "abc==" });
  expect((await Bun.file(join(root, ".gitignore")).text()).split("\n")).toContain(".env");
  expect(memory.projects.has("acme")).toBe(true);
});

test("refuses to overwrite a non-empty directory", async () => {
  await mkdir(join(cwd, "acme"));
  await Bun.write(join(cwd, "acme", "file.txt"), "hi");
  await expect(init({ name: "acme", cwd, install: false, git: false, backend })).rejects.toThrow("not empty");
});

test("validates project names", () => {
  expect(validateProjectName("my-project")).toBeNull();
  expect(validateProjectName("")).not.toBeNull();
  expect(validateProjectName("My Project")).not.toBeNull();
  expect(validateProjectName("../evil")).not.toBeNull();
});
