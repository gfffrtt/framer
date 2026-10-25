import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Backend } from "../backends/index.ts";
import type { ProjectConfig } from "../config.ts";
import { ENTITY_TYPES, entityEnvNames, type Entity } from "../entities.ts";
import { isEmptyDir, json } from "../files.ts";
import { credentialKey, credentialTarget, envPrefix } from "../naming.ts";
import type { Connection, Provisioner } from "../provisioners/index.ts";
import type { Step } from "../steps.ts";

export type AddOptions = {
  root: string;
  config: ProjectConfig;
  /** From `newEntity`: a valid name, not in the project yet. */
  entity: Entity;
  /** One of `PROVISIONERS[entity.type]`. */
  provisioner: Provisioner;
  /** One connection per environment, each from that environment's credentials (ADR 0023). */
  connections: Record<string, Connection>;
  backend: Backend;
};

/**
 * Returns the steps that provision the entity in every environment, store its
 * generated envs in the backend and write its entity config.
 */
export async function planAdd(options: AddOptions): Promise<{ steps: Step[]; keys: string[] }> {
  const { root, config, entity, provisioner, connections, backend } = options;
  const { cloud } = provisioner;

  const targets = config.environments.map((env) => {
    const connection = connections[env];
    if (!connection) throw new Error(`No ${cloud.label} credentials for environment "${env}".`);
    return { env, connection, tokenKey: credentialKey(cloud.tokenKey, credentialTarget(config.name, env, entity)) };
  });
  provisioner.validate?.(config, entity);

  const prefix = envPrefix(entity.type, entity.name);
  const keys = provisioner.envs.map((key) => prefix + key);
  // Other entities' envs, handed to the provisioner (e.g. an app gets the buckets' envs).
  const otherKeys = await entityEnvNames(root, entity.path);
  const { customEnvs } = ENTITY_TYPES[entity.type];

  const verify: Step[] = targets.map(({ env, connection, tokenKey }) => ({
    title: `Verifying ${env} credentials`,
    done: `Verified ${env} credentials`,
    run: () =>
      connection.verify().catch((error: unknown) => {
        // The client doesn't know which scoped key its token came from; name it here.
        throw new Error(`${tokenKey}: ${error instanceof Error ? error.message : error}`, { cause: error });
      }),
  }));

  const provision: Step[] = targets.map(({ env, connection }) => ({
    ...provisioner.describe(config, entity, env),
    run: async () => {
      const vars = await backend.readEnv(config.name, env);
      const envs = {
        ...Object.fromEntries(otherKeys.filter((key) => key in vars).map((key) => [key, vars[key]!])),
        // Custom envs win: the user set them on purpose (ADR 0025).
        ...(customEnvs ? await backend.readEnv(config.name, env, entity.path) : {}),
      };
      const generated = await connection.provision({ config, entity, env, envs });
      await backend.writeEnv(config.name, env, {
        ...vars,
        ...Object.fromEntries(provisioner.envs.map((key) => [prefix + key, generated[key]!])),
      });
    },
  }));

  // Written last, so a failed provisioning leaves no entity behind.
  const writeConfig: Step = {
    title: `Writing ${entity.path}/framer.json`,
    done: `Wrote ${entity.path}/framer.json`,
    run: async () => {
      await mkdir(entity.dir, { recursive: true });
      await Bun.write(join(entity.dir, "framer.json"), json({ cloud: cloud.name, envs: keys }));
    },
  };

  return { steps: [...verify, ...provision, writeConfig], keys };
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
