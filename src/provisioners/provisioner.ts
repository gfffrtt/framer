import type { Cloud, CloudClient, CloudCredentials } from "../clouds/index.ts";
import type { ProjectConfig } from "../config.ts";
import type { EnvVars } from "../dotenv.ts";
import type { Entity } from "../entities.ts";

export type ProvisionContext = {
  config: ProjectConfig;
  entity: Entity;
  env: string;
  /**
   * What the entity receives in this environment: the generated envs of the
   * project's other entities, plus its own custom envs if its type has them.
   */
  envs: EnvVars;
};

/** How a provisioner is written: typed against its cloud's client. */
export type ProvisionerSpec<Client extends CloudClient> = {
  cloud: Cloud<Client>;
  /** Names of the generated envs, without the entity prefix: `["NAME", "ENDPOINT"]`. */
  envs: readonly string[];
  /** Throws if the entity can't be provisioned (e.g. a resource name too long), before anything is created. */
  validate?(config: ProjectConfig, entity: Entity): void;
  /** What the step is called while it runs, and once it is done. */
  describe(config: ProjectConfig, entity: Entity, env: string): { title: string; done: string };
  /** Creates the entity's infrastructure in `env`. Returns its generated envs, keyed by the names in `envs`. */
  provision(context: ProvisionContext & { client: Client }): Promise<Record<string, string>>;
};

/** A provisioner connected to one environment's cloud account. */
export type Connection = {
  verify(): Promise<void>;
  provision(context: ProvisionContext): Promise<Record<string, string>>;
};

/**
 * Provisions one entity type on one cloud (ADR 0022). Its client type is hidden
 * behind `connect`, so the add flow and the registry don't depend on any cloud.
 */
export type Provisioner = Omit<ProvisionerSpec<CloudClient>, "provision"> & {
  /** Connects with one environment's credentials (ADR 0023). */
  connect(credentials: CloudCredentials, fetch?: typeof globalThis.fetch): Connection;
};

export function defineProvisioner<Client extends CloudClient>({ provision, ...spec }: ProvisionerSpec<Client>): Provisioner {
  return {
    ...spec,
    connect(credentials, fetch) {
      const client = spec.cloud.connect(credentials, fetch);
      return { verify: () => client.verify(), provision: (context) => provision({ ...context, client }) };
    },
  };
}
