import type { BackendType, ProjectConfig } from "../config.ts";
import type { EnvVars } from "../dotenv.ts";
import { readRootEnv } from "../dotenv.ts";
import { googleDrive } from "./google-drive.ts";

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
