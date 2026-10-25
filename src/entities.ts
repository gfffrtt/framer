import { exists } from "node:fs/promises";
import { join } from "node:path";

type EntityTypeTraits = {
  /** The entity-type folder, e.g. `apps`. Also the "purpose" of its credentials. */
  dir: string;
  description: string;
  /** Suggested entity name when framer asks for one. */
  placeholder: string;
  /** The type runs code, so it can have custom envs (`.env.<env>` files, ADR 0025). */
  customEnvs: boolean;
  /** `framer add` asks for a create command and runs it to get the entity's code (ADR 0019). */
  createCommand: boolean;
  /** How the add flow asks where the entity goes. */
  cloudQuestion: string;
};

export const ENTITY_TYPES = {
  app: {
    dir: "apps",
    description: "long-running services",
    placeholder: "web",
    customEnvs: true,
    createCommand: true,
    cloudQuestion: "Deploy to",
  },
  db: {
    dir: "dbs",
    description: "databases",
    placeholder: "main",
    customEnvs: false,
    createCommand: false,
    cloudQuestion: "Cloud",
  },
  bucket: {
    dir: "buckets",
    description: "object storage",
    placeholder: "uploads",
    customEnvs: false,
    createCommand: false,
    cloudQuestion: "Cloud",
  },
  job: {
    dir: "jobs",
    description: "scheduled (cron) work",
    placeholder: "main",
    customEnvs: true,
    createCommand: false,
    cloudQuestion: "Cloud",
  },
  task: {
    dir: "tasks",
    description: "one-off or triggered work",
    placeholder: "main",
    customEnvs: true,
    createCommand: false,
    cloudQuestion: "Cloud",
  },
} satisfies Record<string, EntityTypeTraits>;

export type EntityType = keyof typeof ENTITY_TYPES;

export const ENTITY_DIRS = Object.values(ENTITY_TYPES).map((traits) => traits.dir);

/** Entity types that have a given trait, as CLI text: `apps, jobs, tasks`. */
export function entityTypesWith(trait: "customEnvs" | "createCommand"): string {
  return Object.entries(ENTITY_TYPES)
    .filter(([, traits]) => traits[trait])
    .map(([, traits]) => traits.dir)
    .join(", ");
}

/** Parses a CLI argument into an entity type. */
export function parseEntityType(arg: string): EntityType {
  if (!Object.hasOwn(ENTITY_TYPES, arg)) {
    throw new Error(`Unknown entity type "${arg}". Available: ${Object.keys(ENTITY_TYPES).join(", ")}.`);
  }
  return arg as EntityType;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Shared rules for project, environment and entity names. */
export function validateName(name: string, label: string): string | null {
  if (!name) return `${label} is required.`;
  if (name.length > 214) return `${label} must be at most 214 characters.`;
  if (!NAME_PATTERN.test(name)) {
    return `${label} must be lowercase and contain only letters, numbers and dashes.`;
  }
  return null;
}

export type Entity = {
  type: EntityType;
  name: string;
  /** Where the entity lives, relative to the project root: `apps/web`. */
  path: string;
  /** Absolute path of the entity folder. */
  dir: string;
};

/** The entity `type`/`name` of the project at `root`. Throws on an invalid name. */
export function entityAt(root: string, type: EntityType, name: string): Entity {
  const error = validateName(name, "Entity name");
  if (error) throw new Error(error);
  const path = `${ENTITY_TYPES[type].dir}/${name}`;
  return { type, name, path, dir: join(root, path) };
}

/** Whether the entity exists, i.e. has an entity config. */
export function entityExists(entity: Entity): Promise<boolean> {
  return exists(join(entity.dir, "framer.json"));
}

/** An entity `framer add` can create: valid name, not in the project yet. */
export async function newEntity(root: string, type: EntityType, name: string): Promise<Entity> {
  const entity = entityAt(root, type, name);
  if (await entityExists(entity)) throw new Error(`${entity.path} already exists.`);
  return entity;
}

/**
 * Names of the generated envs of every entity in the project, read from the `envs`
 * of each entity config, except the entity at `except` (e.g. `apps/web`).
 */
export async function entityEnvNames(root: string, except?: string): Promise<string[]> {
  const names: string[] = [];
  for (const dir of ENTITY_DIRS) {
    for await (const file of new Bun.Glob(`${dir}/*/framer.json`).scan({ cwd: root })) {
      const [, name] = file.split(/[\\/]/);
      if (`${dir}/${name}` === except) continue;
      const config = await Bun.file(join(root, file)).json().catch(() => null);
      if (Array.isArray(config?.envs)) names.push(...config.envs.filter((env: unknown) => typeof env === "string"));
    }
  }
  return names;
}
