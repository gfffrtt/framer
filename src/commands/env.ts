import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { Backend } from "../backends/index.ts";
import type { ProjectConfig } from "../config.ts";
import { CUSTOM_ENV_IGNORE, customEnvFile, parseEnv } from "../dotenv.ts";
import { ENTITY_TYPES, entityAt, entityExists, entityTypesWith, type EntityType } from "../entities.ts";
import type { Step } from "../steps.ts";

export type EnvOptions = {
  root: string;
  config: ProjectConfig;
  type: EntityType;
  name: string;
  backend: Backend;
};

/**
 * Finds the entity's `.env.<env>` files for every declared environment and returns
 * the steps that push each one to the backend, replacing what was there.
 */
export async function planEnv(
  options: EnvOptions,
): Promise<{ path: string; steps: Step[]; pushed: { env: string; keys: string[] }[]; skipped: string[] }> {
  const { root, config, type, name, backend } = options;

  if (!ENTITY_TYPES[type].customEnvs) {
    throw new Error(`${ENTITY_TYPES[type].dir} have no custom envs. Only ${entityTypesWith("customEnvs")} do.`);
  }
  const entity = entityAt(root, type, name);
  if (!(await entityExists(entity))) {
    throw new Error(`${entity.path} doesn't exist. Run "framer add ${type} ${name}" first.`);
  }
  const { path } = entity;

  const steps: Step[] = [];
  const pushed: { env: string; keys: string[] }[] = [];
  const skipped: string[] = [];
  for (const env of config.environments) {
    const file = Bun.file(join(root, customEnvFile(path, env)));
    if (!(await file.exists())) {
      skipped.push(env);
      continue;
    }
    const vars = parseEnv(await file.text());
    pushed.push({ env, keys: Object.keys(vars) });
    steps.push({
      title: `Pushing ${customEnvFile(path, env)}`,
      done: `Pushed ${customEnvFile(path, env)} to ${backend.location(config.name, env, path)}`,
      run: () => backend.writeEnv(config.name, env, vars, path),
    });
  }

  if (pushed.length === 0) {
    const files = config.environments.map((env) => customEnvFile(path, env)).join(", ");
    throw new Error(`No custom env files found. Looked for ${files}.`);
  }
  return { path, steps, pushed, skipped };
}

/**
 * Makes sure git ignores the entity's custom env files, which hold secrets. Adds
 * `CUSTOM_ENV_IGNORE` to the root `.gitignore` if not. Returns whether it changed it.
 */
export async function ignoreCustomEnvFiles(root: string, path: string): Promise<boolean> {
  const check = await Bun.$`git check-ignore -q ${customEnvFile(path, "framer-check")}`.cwd(root).nothrow().quiet();
  // 0: ignored. 128: not a git repo. 1: not ignored.
  if (check.exitCode !== 1) return false;
  const gitignore = Bun.file(join(root, ".gitignore"));
  const text = (await gitignore.exists()) ? await gitignore.text() : "";
  await appendFile(join(root, ".gitignore"), `${text && !text.endsWith("\n") ? "\n" : ""}${CUSTOM_ENV_IGNORE.join("\n")}\n`);
  return true;
}
