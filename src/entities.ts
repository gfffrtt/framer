export const ENTITY_TYPES = [
  { type: "app", dir: "apps", description: "long-running services" },
  { type: "db", dir: "dbs", description: "databases" },
  { type: "bucket", dir: "buckets", description: "object storage" },
  { type: "job", dir: "jobs", description: "scheduled (cron) work" },
  { type: "task", dir: "tasks", description: "one-off or triggered work" },
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
