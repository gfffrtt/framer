import { exists, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Backend } from "../backends/index.ts";
import type { ClientOf, CloudName } from "../clouds/index.ts";
import type { ProjectConfig } from "../config.ts";
import { ENTITY_TYPES, entityEnvNames, validateName, type EntityType } from "../entities.ts";
import { findProvisioner } from "../provisioners/index.ts";
import type { InitStep } from "./init.ts";

export type AddOptions<C extends CloudName = CloudName> = {
  root: string;
  config: ProjectConfig;
  type: EntityType;
  name: string;
  cloud: C;
  /** One client per environment, each built from that environment's credentials (ADR 0023). */
  clients: Record<string, ClientOf<C>>;
  backend: Backend;
};

/** `uploads` → `BUCKET_UPLOADS_`. */
export function envPrefix(type: EntityType, name: string): string {
  return `${type}_${name}_`.toUpperCase().replace(/-/g, "_");
}

/** `apps/web`: where an entity lives, relative to the project root. */
export function entityPath(type: EntityType, name: string): string {
  return `${ENTITY_TYPES.find((entityType) => entityType.type === type)!.dir}/${name}`;
}

/**
 * Validates the options and returns the steps that provision the entity in every
 * environment, store its generated envs in the backend and write its entity config.
 */
export async function planAdd(options: AddOptions): Promise<{ dir: string; steps: InitStep[]; keys: string[] }> {
  const { root, config, type, name, cloud, clients, backend } = options;

  const error = validateName(name, "Entity name");
  if (error) throw new Error(error);

  const provisioner = findProvisioner(type, cloud);
  if (!provisioner) throw new Error(`framer can't provision ${type}s on ${cloud} yet.`);
  const missing = config.environments.find((env) => !clients[env]);
  if (missing) throw new Error(`No ${cloud} credentials for environment "${missing}".`);

  const path = entityPath(type, name);
  const dir = join(root, path);
  if (await exists(join(dir, "framer.json"))) throw new Error(`${path} already exists.`);
  provisioner.validate?.(config, name);

  const prefix = envPrefix(type, name);
  const keys = provisioner.envs.map((key) => prefix + key);
  // Other entities' envs, handed to the provisioner (e.g. an app gets the buckets' envs).
  const otherKeys = await entityEnvNames(root, path);

  const customEnvs = ENTITY_TYPES.find((entityType) => entityType.type === type)!.customEnvs;

  const steps: InitStep[] = config.environments.map((env) => ({
    title: `Verifying ${env} credentials`,
    done: `Verified ${env} credentials`,
    run: () => clients[env]!.verify(),
  }));

  for (const env of config.environments) {
    steps.push({
      ...provisioner.describe(config, name, env),
      run: async () => {
        const vars = await backend.readEnv(config.name, env);
        const envs = {
          ...Object.fromEntries(otherKeys.filter((key) => key in vars).map((key) => [key, vars[key]!])),
          // Custom envs win: the user set them on purpose (ADR 0025).
          ...(customEnvs ? await backend.readEnv(config.name, env, path) : {}),
        };
        const client = clients[env]!;
        const generated = await provisioner.provision({ config, name, dir, env, client, envs });
        await backend.writeEnv(config.name, env, {
          ...vars,
          ...Object.fromEntries(provisioner.envs.map((key) => [prefix + key, generated[key]!])),
        });
      },
    });
  }

  // Written last, so a failed provisioning leaves no entity behind.
  steps.push({
    title: `Writing ${path}/framer.json`,
    done: `Wrote ${path}/framer.json`,
    run: async () => {
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "framer.json"), JSON.stringify({ cloud, envs: keys }, null, 2) + "\n");
    },
  });

  return { dir, steps, keys };
}

export async function add(options: AddOptions): Promise<string> {
  const { dir, steps } = await planAdd(options);
  for (const step of steps) await step.run();
  return dir;
}

/** True when `dir` is missing or has no files. */
export async function isEmptyDir(dir: string): Promise<boolean> {
  return (await readdir(dir).catch(() => [])).length === 0;
}

/**
 * Runs an app's create command (e.g. `bun create vite .`) inside its empty folder,
 * attached to the terminal so the user can answer the command's own questions.
 */
export async function runCreateCommand(dir: string, command: string): Promise<void> {
  if (!(await isEmptyDir(dir))) throw new Error(`${dir} is not empty.`);
  await mkdir(dir, { recursive: true });

  const shell = process.platform === "win32" ? ["cmd", "/c", command] : ["sh", "-c", command];
  const exitCode = await Bun.spawn(shell, { cwd: dir, stdio: ["inherit", "inherit", "inherit"] }).exited;
  if (exitCode !== 0) throw new Error(`"${command}" failed (exit code ${exitCode}).`);

  if (await isEmptyDir(dir)) {
    throw new Error(`"${command}" created nothing in ${dir}. Point it at the current folder, e.g. "bun create vite .".`);
  }
  // The project is already a repo; a nested one would hide the app from it.
  await rm(join(dir, ".git"), { recursive: true, force: true });
}
