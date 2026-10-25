import type { ClientOf, CloudName } from "../clouds/index.ts";
import type { ProjectConfig } from "../config.ts";
import type { EnvVars } from "../dotenv.ts";
import type { EntityType } from "../entities.ts";

export type ProvisionContext<C extends CloudName> = {
  config: ProjectConfig;
  /** Entity name, e.g. `uploads`. */
  name: string;
  /** Absolute path of the entity folder. */
  dir: string;
  env: string;
  client: ClientOf<C>;
  /**
   * What the entity receives in this environment: the generated envs of the
   * project's other entities, plus its own custom envs if its type has them.
   */
  envs: EnvVars;
};

/** Provisions one entity type on one cloud. `framer add` runs it once per environment. */
export type Provisioner<C extends CloudName = CloudName> = {
  cloud: C;
  /** Names of the generated envs, without the entity prefix: `["NAME", "ENDPOINT"]`. */
  envs: readonly string[];
  /** Throws if the entity can't be provisioned (e.g. a resource name too long), before anything is created. */
  validate?(config: ProjectConfig, name: string): void;
  /** What the step is called while it runs, and once it is done. */
  describe(config: ProjectConfig, name: string, env: string): { title: string; done: string };
  /** Creates the entity's infrastructure in `env`. Returns its generated envs, keyed by the names in `envs`. */
  provision(context: ProvisionContext<C>): Promise<Record<string, string>>;
};

export function defineProvisioner<C extends CloudName>(provisioner: Provisioner<C>): Provisioner<C> {
  return provisioner;
}

/** `<project>-<name>-<env>`: how framer names the real resources behind an entity (ADR 0013). */
export function resourceName(project: string, name: string, env: string): string {
  return `${project}-${name}-${env}`;
}
