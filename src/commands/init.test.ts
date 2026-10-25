import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, exists } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init, ENTITY_DIRS, validateProjectName } from "./init.ts";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "framer-init-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

test("scaffolds an empty turborepo with framer.json and entity folders", async () => {
  const root = await init({ name: "acme", cwd, install: false, git: false });

  expect(await Bun.file(join(root, "framer.json")).json()).toEqual({ name: "acme" });

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

test("refuses to overwrite a non-empty directory", async () => {
  await mkdir(join(cwd, "acme"));
  await Bun.write(join(cwd, "acme", "file.txt"), "hi");
  await expect(init({ name: "acme", cwd, install: false, git: false })).rejects.toThrow("not empty");
});

test("validates project names", () => {
  expect(validateProjectName("my-project")).toBeNull();
  expect(validateProjectName("")).not.toBeNull();
  expect(validateProjectName("My Project")).not.toBeNull();
  expect(validateProjectName("../evil")).not.toBeNull();
});
