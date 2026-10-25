import { appendFile, exists } from "node:fs/promises";
import { join } from "node:path";
import type { Backend } from "../backends/index.ts";
import type { ProjectConfig } from "../config.ts";
import { parseEnv } from "../dotenv.ts";
import { ENTITY_TYPES, validateName, type EntityType } from "../entities.ts";
import { entityPath } from "./add.ts";
import type { InitStep } from "./init.ts";

/** Lines `framer env` adds to the root `.gitignore` when the custom env files aren't ignored yet. */
export const ENV_FILES_IGNORE = [".env.*", "!.env.example"];

export type EnvOptions = {
  root: string;
  config: ProjectConfig;
  type: EntityType;
  name: string;
  backend: Backend;
};

/** The custom env file of an entity for one environment: `apps/web/.env.prod`. */
export function customEnvFile(path: string, env: string): string {
  return `${path}/.env.${env}`;
}

/**
 * Finds the entity's `.env.<env>` files for every declared environment and returns
 * the steps that push each one to the backend, replacing what was there.
 */
export async function planEnv(
  options: EnvOptions,
): Promise<{ path: string; steps: InitStep[]; pushed: { env: string; keys: string[] }[]; skipped: string[] }> {
  const { root, config, type, name, backend } = options;

  const entityType = ENTITY_TYPES.find((candidate) => candidate.type === type)!;
  if (!entityType.customEnvs) {
    const types = ENTITY_TYPES.filter((candidate) => candidate.customEnvs).map((candidate) => `${candidate.type}s`);
    throw new Error(`${type}s have no custom envs. Only ${types.join(", ")} do.`);
  }
  const error = validateName(name, "Entity name");
  if (error) throw new Error(error);
  const path = entityPath(type, name);
  if (!(await exists(join(root, path, "framer.json")))) {
    throw new Error(`${path} doesn't exist. Run "framer add ${type} ${name}" first.`);
  }

  const steps: InitStep[] = [];
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
      done: `Pushed ${customEnvFile(path, env)} to .framer/${config.name}/${path}/${env}.env`,
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
 * `ENV_FILES_IGNORE` to the root `.gitignore` if not. Returns whether it changed it.
 */
export async function ignoreCustomEnvFiles(root: string, path: string): Promise<boolean> {
  const check = await Bun.$`git check-ignore -q ${`${path}/.env.framer-check`}`.cwd(root).nothrow().quiet();
  // 0: ignored. 128: not a git repo. 1: not ignored.
  if (check.exitCode !== 1) return false;
  const gitignore = Bun.file(join(root, ".gitignore"));
  const text = (await gitignore.exists()) ? await gitignore.text() : "";
  await appendFile(join(root, ".gitignore"), `${text && !text.endsWith("\n") ? "\n" : ""}${ENV_FILES_IGNORE.join("\n")}\n`);
  return true;
}
