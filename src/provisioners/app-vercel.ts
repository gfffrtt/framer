import { join, sep } from "node:path";
import type { DeploymentFile } from "../clouds/vercel.ts";
import { defineProvisioner, resourceName } from "./provisioner.ts";

const PROJECT_NAME_MAX = 100;

/** Never deployed, even when the app's own `.gitignore` doesn't list them. */
const IGNORED = /(^|\/)(node_modules|\.git|\.vercel|\.turbo|\.env(\..*)?)(\/|$)/;

/** An app on Vercel: one Vercel project per environment, with the project's generated envs, deployed to production. */
export const appOnVercel = defineProvisioner({
  cloud: "vercel",
  envs: ["URL"],

  validate(config, name) {
    for (const env of config.environments) {
      const project = resourceName(config.name, name, env);
      if (project.length > PROJECT_NAME_MAX) {
        throw new Error(`Vercel project name "${project}" is longer than ${PROJECT_NAME_MAX} characters. Use a shorter name.`);
      }
    }
  },

  describe(config, name, env) {
    const project = resourceName(config.name, name, env);
    return {
      title: `Deploying ${project} to Vercel`,
      done: `Deployed ${project} to Vercel and stored its envs in ${env}.env`,
    };
  },

  async provision({ config, name, dir, env, client, envs }) {
    const project = resourceName(config.name, name, env);
    const id = await client.ensureProject(project);
    await client.setEnv(id, envs);
    const url = await client.deploy({ id, name: project }, await appFiles(dir));
    return { URL: url };
  },
});

/** The app's files to upload: what git would track (respecting `.gitignore`), or every file outside a git repo. */
export async function appFiles(dir: string): Promise<DeploymentFile[]> {
  const git = await Bun.$`git ls-files --cached --others --exclude-standard -z`.cwd(dir).nothrow().quiet();
  const paths =
    git.exitCode === 0 ?
      git.stdout.toString().split("\0").filter(Boolean)
    : (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dir, dot: true }))).map((path) => path.split(sep).join("/"));

  const files: DeploymentFile[] = [];
  for (const file of paths.filter((path) => !IGNORED.test(path)).sort()) {
    const handle = Bun.file(join(dir, file));
    // `git ls-files` still lists tracked files that were deleted from disk.
    if (await handle.exists()) files.push({ file, data: await handle.bytes() });
  }
  if (files.length === 0) throw new Error(`No files to deploy in ${dir}.`);
  return files;
}
