import type { Backend } from "../backends/index.ts";
import type { EnvVars } from "../dotenv.ts";

/** An in-memory backend for tests: `files["acme/dev.env"]`, `files["acme/apps/web/dev.env"]`. */
export function memoryBackend() {
  const projects = new Set<string>();
  const files: Record<string, EnvVars> = {};
  const backend: Backend = {
    async ensureProject(project) {
      projects.add(project);
    },
    async readEnv(project, env, entity) {
      return { ...files[backend.location(project, env, entity)] };
    },
    async writeEnv(project, env, vars, entity) {
      files[backend.location(project, env, entity)] = { ...vars };
    },
    location(project, env, entity) {
      return [project, entity, env && `${env}.env`].filter(Boolean).join("/");
    },
  };
  return { backend, projects, files };
}
