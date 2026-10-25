// How framer names the things it creates. One function per row of the naming
// table in VISION.md ("The add flow").

import { ENTITY_TYPES, type EntityType } from "./entities.ts";

/** What one set of cloud credentials is for: one entity in one environment (ADR 0023). */
export type CredentialTarget = {
  project: string;
  env: string;
  /** The entity-type folder, e.g. `buckets`. */
  purpose: string;
  /** The entity name, e.g. `uploads`. */
  name: string;
};

export function credentialTarget(project: string, env: string, entity: { type: EntityType; name: string }): CredentialTarget {
  return { project, env, purpose: ENTITY_TYPES[entity.type].dir, name: entity.name };
}

/**
 * The root `.env` key of a credential for one entity in one environment, e.g.
 * `CLOUDFLARE_API_TOKEN` → `CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS`. framer only
 * reads this exact key: there is no fallback to a less specific one (ADR 0023).
 */
export function credentialKey(key: string, { env, purpose, name }: CredentialTarget): string {
  return [key, env, purpose, name].join("_").toUpperCase().replace(/-/g, "_");
}

/** The name the user gives the token in the cloud's dashboard: `framer-<project>-<env>-<purpose>-<name>`. */
export function credentialName({ project, env, purpose, name }: CredentialTarget): string {
  return `framer-${project}-${env}-${purpose}-${name}`;
}

/** A credential framer creates for one resource: `framer-buckets-acme-uploads-prod`. */
export function resourceCredentialName(type: EntityType, resource: string): string {
  return `framer-${ENTITY_TYPES[type].dir}-${resource}`;
}

/** `<project>-<name>-<env>`: the real resources behind an entity (ADR 0013). */
export function resourceName(project: string, name: string, env: string): string {
  return `${project}-${name}-${env}`;
}

/** Prefix of an entity's generated envs: `bucket`, `uploads` → `BUCKET_UPLOADS_`. */
export function envPrefix(type: EntityType, name: string): string {
  return `${type}_${name}_`.toUpperCase().replace(/-/g, "_");
}
