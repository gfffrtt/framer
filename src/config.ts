import { dirname, join, resolve } from "node:path";

export type BackendType = "google-drive";

export type ProjectConfig = {
  name: string;
  environments: string[];
  backend: { type: BackendType };
};

/** Walks up from `cwd` to the closest directory whose `framer.json` is a project config. */
export async function findProjectRoot(cwd = process.cwd()): Promise<string> {
  let dir = resolve(cwd);
  while (true) {
    const file = Bun.file(join(dir, "framer.json"));
    if (await file.exists()) {
      const config = await file.json().catch(() => null);
      if (config && typeof config.name === "string") return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Not inside a framer project. Run "framer init" first.');
    dir = parent;
  }
}

export async function readProjectConfig(root: string): Promise<ProjectConfig> {
  const config = await Bun.file(join(root, "framer.json")).json();
  if (typeof config.name !== "string") throw new Error("Project config is missing \"name\".");
  if (
    !Array.isArray(config.environments) ||
    config.environments.length === 0 ||
    !config.environments.every((env: unknown) => typeof env === "string")
  ) {
    throw new Error('Project config needs an "environments" array, e.g. ["dev", "prod"].');
  }
  if (config.backend?.type !== "google-drive") {
    throw new Error('Project config needs a "backend", e.g. { "type": "google-drive" }.');
  }
  return config as ProjectConfig;
}
