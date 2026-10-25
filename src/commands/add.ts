import { exists, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Backend } from "../backends/index.ts";
import type { Cloudflare } from "../clouds/cloudflare.ts";
import type { ProjectConfig } from "../config.ts";
import { ENTITY_TYPES, validateName } from "../entities.ts";
import type { InitStep } from "./init.ts";

/** Cloud adapters framer can provision with today, per entity type. */
export const SUPPORTED = { bucket: ["cloudflare"] } as const;

export type AddType = keyof typeof SUPPORTED;
export type AddCloud = (typeof SUPPORTED)[AddType][number];

const BUCKET_NAME_MAX = 63;

export type AddOptions = {
  root: string;
  config: ProjectConfig;
  type: AddType;
  name: string;
  cloud: AddCloud;
  backend: Backend;
  cloudflare: Cloudflare;
};

export function isSupportedType(type: string): type is AddType {
  return type in SUPPORTED;
}

/** `uploads` → `BUCKET_UPLOADS_`. */
export function envPrefix(type: AddType, name: string): string {
  return `${type}_${name}_`.toUpperCase().replace(/-/g, "_");
}

/** The real R2 bucket behind an entity in one environment, e.g. `acme-uploads-dev`. */
export function bucketName(project: string, name: string, env: string): string {
  return `${project}-${name}-${env}`;
}

/**
 * Validates the options and returns the steps that provision the entity in every
 * environment, store its generated envs in the backend and write its entity config.
 */
export async function planAdd(options: AddOptions): Promise<{ dir: string; steps: InitStep[]; keys: string[] }> {
  const { root, config, type, name, cloud, backend, cloudflare } = options;

  const error = validateName(name, "Entity name");
  if (error) throw new Error(error);

  const typeDir = ENTITY_TYPES.find((entityType) => entityType.type === type)!.dir;
  const dir = join(root, typeDir, name);
  if (await exists(join(dir, "framer.json"))) {
    throw new Error(`${typeDir}/${name} already exists.`);
  }

  for (const env of config.environments) {
    const bucket = bucketName(config.name, name, env);
    if (bucket.length > BUCKET_NAME_MAX) {
      throw new Error(`Bucket name "${bucket}" is longer than ${BUCKET_NAME_MAX} characters. Use a shorter name.`);
    }
  }

  const prefix = envPrefix(type, name);
  const keys = ["NAME", "ENDPOINT", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"].map((key) => prefix + key);

  const steps: InitStep[] = [
    {
      title: "Verifying Cloudflare credentials",
      done: "Verified Cloudflare credentials",
      run: () => cloudflare.verify(),
    },
  ];

  for (const env of config.environments) {
    const bucket = bucketName(config.name, name, env);
    steps.push({
      title: `Provisioning R2 bucket ${bucket}`,
      done: `Provisioned R2 bucket ${bucket} and stored its envs in ${env}.env`,
      run: async () => {
        await cloudflare.ensureR2Bucket(bucket);
        const credentials = await cloudflare.createR2Credentials(bucket);
        const vars = await backend.readEnv(config.name, env);
        await backend.writeEnv(config.name, env, {
          ...vars,
          [`${prefix}NAME`]: bucket,
          [`${prefix}ENDPOINT`]: cloudflare.endpoint,
          [`${prefix}ACCESS_KEY_ID`]: credentials.accessKeyId,
          [`${prefix}SECRET_ACCESS_KEY`]: credentials.secretAccessKey,
        });
      },
    });
  }

  // Written last, so a failed provisioning leaves no entity behind.
  steps.push({
    title: `Writing ${typeDir}/${name}/framer.json`,
    done: `Wrote ${typeDir}/${name}/framer.json`,
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
