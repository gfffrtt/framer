import type { BackendType, ProjectConfig } from "../config.ts";
import type { EnvVars } from "../dotenv.ts";
import { readRootEnv } from "../dotenv.ts";
import { googleDrive } from "./google-drive.ts";

/** Where framer stores the envs it generates: one env file per project and environment. */
export type Backend = {
  /** Creates the project's storage (e.g. `.framer/<project>/`) if it does not exist yet. */
  ensureProject(project: string): Promise<void>;
  /** Reads `<env>.env` of a project. Missing file = no vars. */
  readEnv(project: string, env: string): Promise<EnvVars>;
  /** Replaces `<env>.env` of a project. */
  writeEnv(project: string, env: string, vars: EnvVars): Promise<void>;
};

export const BACKENDS: { type: BackendType; label: string }[] = [{ type: "google-drive", label: "Google Drive" }];

/** Builds the project's backend from the credentials in the root `.env` (or the process env). */
export async function loadBackend(root: string, config: ProjectConfig): Promise<Backend> {
  switch (config.backend.type) {
    case "google-drive": {
      const googleAuth = (await readRootEnv(root)).GOOGLE_AUTH ?? process.env.GOOGLE_AUTH;
      if (!googleAuth) {
        throw new Error('GOOGLE_AUTH is missing. Add it to the root .env (run "framer init" to log in).');
      }
      return googleDrive(googleAuth);
    }
  }
}
