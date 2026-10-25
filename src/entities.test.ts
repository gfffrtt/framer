import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { entityEnvNames, newEntity, parseEntityType } from "./entities.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "framer-entities-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("a new entity has a valid name and isn't in the project yet", async () => {
  expect(await newEntity(root, "bucket", "uploads")).toEqual({
    type: "bucket",
    name: "uploads",
    path: "buckets/uploads",
    dir: join(root, "buckets", "uploads"),
  });
  await Bun.write(join(root, "buckets", "uploads", "framer.json"), "{}");
  await expect(newEntity(root, "bucket", "uploads")).rejects.toThrow("buckets/uploads already exists");
  await expect(newEntity(root, "bucket", "Uploads")).rejects.toThrow("lowercase");
});

test("parses entity types", () => {
  expect(parseEntityType("app")).toBe("app");
  expect(() => parseEntityType("toString")).toThrow('Unknown entity type "toString"');
});

test("lists the env names of every other entity", async () => {
  await Bun.write(join(root, "buckets", "uploads", "framer.json"), JSON.stringify({ envs: ["BUCKET_UPLOADS_NAME"] }));
  await Bun.write(join(root, "apps", "web", "framer.json"), JSON.stringify({ envs: ["APP_WEB_URL"] }));
  expect((await entityEnvNames(root)).sort()).toEqual(["APP_WEB_URL", "BUCKET_UPLOADS_NAME"]);
  expect(await entityEnvNames(root, "apps/web")).toEqual(["BUCKET_UPLOADS_NAME"]);
});
