/** `customEnvs`: the type runs code, so it can have custom envs (`.env.<env>` files, ADR 0025). */
export const ENTITY_TYPES = [
  { type: "app", dir: "apps", description: "long-running services", customEnvs: true },
  { type: "db", dir: "dbs", description: "databases", customEnvs: false },
  { type: "bucket", dir: "buckets", description: "object storage", customEnvs: false },
  { type: "job", dir: "jobs", description: "scheduled (cron) work", customEnvs: true },
  { type: "task", dir: "tasks", description: "one-off or triggered work", customEnvs: true },
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number]["type"];

export const ENTITY_DIRS = ENTITY_TYPES.map((entityType) => entityType.dir);

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Shared rules for project names and entity names. */
export function validateName(name: string, label: string): string | null {
  if (!name) return `${label} is required.`;
  if (name.length > 214) return `${label} must be at most 214 characters.`;
  if (!NAME_PATTERN.test(name)) {
    return `${label} must be lowercase and contain only letters, numbers and dashes.`;
  }
  return null;
}

/**
 * Names of the generated envs of every entity in the project, read from the `envs`
 * of each entity config, except the entity at `except` (e.g. `apps/web`).
 */
export async function entityEnvNames(root: string, except?: string): Promise<string[]> {
  const names: string[] = [];
  for (const dir of ENTITY_DIRS) {
    for await (const path of new Bun.Glob(`${dir}/*/framer.json`).scan({ cwd: root })) {
      if (except && path.split(/[\\/]/).slice(0, 2).join("/") === except) continue;
      const config = await Bun.file(`${root}/${path}`).json().catch(() => null);
      if (Array.isArray(config?.envs)) names.push(...config.envs.filter((env: unknown) => typeof env === "string"));
    }
  }
  return names;
}
