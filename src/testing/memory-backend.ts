import type { Backend } from "../backends/index.ts";
import type { EnvVars } from "../dotenv.ts";

/** An in-memory backend for tests: `files["acme/dev.env"]`. */
export function memoryBackend() {
  const projects = new Set<string>();
  const files: Record<string, EnvVars> = {};
  const backend: Backend = {
    async ensureProject(project) {
      projects.add(project);
    },
    async readEnv(project, env) {
      return { ...files[`${project}/${env}.env`] };
    },
    async writeEnv(project, env, vars) {
      files[`${project}/${env}.env`] = { ...vars };
    },
  };
  return { backend, projects, files };
}
