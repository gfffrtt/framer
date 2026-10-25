import type { Backend } from "../backends/index.ts";
import type { EnvVars } from "../dotenv.ts";

/** An in-memory backend for tests: `files["acme/dev.env"]`, `files["acme/apps/web/dev.env"]`. */
function path(project: string, env: string, entity?: string): string {
  return [project, entity, `${env}.env`].filter(Boolean).join("/");
}

export function memoryBackend() {
  const projects = new Set<string>();
  const files: Record<string, EnvVars> = {};
  const backend: Backend = {
    async ensureProject(project) {
      projects.add(project);
    },
    async readEnv(project, env, entity) {
      return { ...files[path(project, env, entity)] };
    },
    async writeEnv(project, env, vars, entity) {
      files[path(project, env, entity)] = { ...vars };
    },
  };
  return { backend, projects, files };
}
