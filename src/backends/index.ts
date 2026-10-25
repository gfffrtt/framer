import type { ProjectConfig } from "../config.ts";
import { readRootEnv, type EnvVars } from "../dotenv.ts";
import { GOOGLE_DRIVE } from "./google-drive.ts";

/**
 * Where framer stores envs: one env file per environment for the project's generated
 * envs (`<env>.env`), and one per environment for each entity's custom envs
 * (`<entity>/<env>.env`, e.g. `apps/web/prod.env`).
 */
export type Backend = {
  /** Creates the project's storage (e.g. `.framer/<project>/`) if it does not exist yet. */
  ensureProject(project: string): Promise<void>;
  /** Reads `<env>.env` of a project, or of one of its entities (`apps/web`). Missing file = no vars. */
  readEnv(project: string, env: string, entity?: string): Promise<EnvVars>;
  /** Replaces `<env>.env` of a project, or of one of its entities (`apps/web`). */
  writeEnv(project: string, env: string, vars: EnvVars, entity?: string): Promise<void>;
  /** Where the project's storage, or one of its env files, lives, for the user: `.framer/acme/prod.env`. */
  location(project: string, env?: string, entity?: string): string;
};

/** A kind of backend: how framer gets its credential and connects to it. */
export type BackendAdapter = {
  label: string;
  /** The root `.env` key holding the credential: `GOOGLE_AUTH`. */
  credentialKey: string;
  /** What the credential looks like, shown when the user pastes it. */
  credentialHint: string;
  /** Shown for the browser login option: "Log in with Google". */
  loginLabel: string;
  /** Logs in in the browser and returns the credential. `onUrl` receives the URL to show. */
  login(onUrl: (url: string) => void): Promise<string>;
  connect(credential: string): Backend;
};

export const BACKENDS = { "google-drive": GOOGLE_DRIVE } satisfies Record<string, BackendAdapter>;

export type BackendType = keyof typeof BACKENDS;

export function isBackendType(value: unknown): value is BackendType {
  return typeof value === "string" && Object.hasOwn(BACKENDS, value);
}

/** Builds the project's backend from the credential in the root `.env` (or the process env). */
export async function loadBackend(root: string, config: ProjectConfig): Promise<Backend> {
  const adapter = BACKENDS[config.backend.type];
  const credential = (await readRootEnv(root))[adapter.credentialKey] ?? process.env[adapter.credentialKey];
  if (!credential) {
    throw new Error(`${adapter.credentialKey} is missing. Add it to the root .env (run "framer init" to log in).`);
  }
  return adapter.connect(credential);
}
