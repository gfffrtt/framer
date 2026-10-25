import { mkdir, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { Backend } from "../backends/index.ts";
import type { BackendType, ProjectConfig } from "../config.ts";
import { updateRootEnv } from "../dotenv.ts";
import { ENTITY_DIRS, validateName } from "../entities.ts";

const TURBO_VERSION = "^2.11.10";
export const DEFAULT_ENVIRONMENTS = ["dev", "prod"];

export type InitOptions = {
  name: string;
  /** Parent directory the project folder is created in. */
  cwd?: string;
  install?: boolean;
  git?: boolean;
  backend: {
    type: BackendType;
    /** Credentials saved to the root `.env`, e.g. `{ GOOGLE_AUTH: "…" }`. */
    credentials: Record<string, string>;
    client: Backend;
  };
};

export function validateProjectName(name: string): string | null {
  return validateName(name, "Project name");
}

async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true;
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function projectFiles(name: string, backend: BackendType): Record<string, string> {
  const config: ProjectConfig = { name, environments: DEFAULT_ENVIRONMENTS, backend: { type: backend } };
  return {
    "framer.json": json(config),
    "package.json": json({
      name,
      private: true,
      packageManager: `bun@${Bun.version}`,
      workspaces: ENTITY_DIRS.map((dir) => `${dir}/*`),
      scripts: {
        build: "turbo run build",
        dev: "turbo run dev",
        lint: "turbo run lint",
        test: "turbo run test",
      },
      devDependencies: {
        turbo: TURBO_VERSION,
      },
    }),
    "turbo.json": json({
      $schema: "https://turborepo.com/schema.json",
      ui: "tui",
      tasks: {
        build: {
          dependsOn: ["^build"],
          inputs: ["$TURBO_DEFAULT$", ".env*"],
          outputs: ["dist/**"],
        },
        lint: { dependsOn: ["^lint"] },
        test: { dependsOn: ["^build"] },
        dev: { cache: false, persistent: true },
      },
    }),
    ".gitignore": [
      "node_modules",
      ".turbo",
      "dist",
      "coverage",
      ".env",
      ".env.*.local",
      ".DS_Store",
      "",
    ].join("\n"),
    "README.md": `# ${name}\n\nA framer project.\n\n${ENTITY_DIRS.map((dir) => `- \`${dir}/\``).join("\n")}\n`,
    ...Object.fromEntries(ENTITY_DIRS.map((dir) => [join(dir, ".gitkeep"), ""])),
  };
}

export type InitStep = {
  /** Shown while the step runs. */
  title: string;
  /** Shown once the step is done. */
  done: string;
  run: () => Promise<void>;
};

/** Validates the options and returns the steps that create the project, without running them. */
export async function planInit(options: InitOptions): Promise<{ root: string; steps: InitStep[] }> {
  const { name, cwd = process.cwd(), install = true, git = true, backend } = options;

  const error = validateProjectName(name);
  if (error) throw new Error(error);

  const root = resolve(cwd, name);
  if (!(await isEmptyOrMissing(root))) {
    throw new Error(`Directory "${basename(root)}" already exists and is not empty.`);
  }

  const steps: InitStep[] = [
    {
      title: "Writing project files",
      done: "Wrote project files",
      run: async () => {
        await mkdir(root, { recursive: true });
        for (const [path, content] of Object.entries(projectFiles(name, backend.type))) {
          await Bun.write(join(root, path), content);
        }
      },
    },
    {
      title: "Saving backend credentials to .env",
      done: "Saved backend credentials to .env",
      run: () => updateRootEnv(root, backend.credentials),
    },
    {
      title: `Creating .framer/${name} in the backend`,
      done: `Created .framer/${name} in the backend`,
      run: () => backend.client.ensureProject(name),
    },
  ];

  if (git) {
    steps.push({
      title: "Initializing git repository",
      done: "Initialized git repository",
      run: () => shell(Bun.$`git init --quiet`.cwd(root), "git init"),
    });
  }

  if (install) {
    steps.push({
      title: "Installing dependencies",
      done: "Installed dependencies",
      run: () => shell(Bun.$`bun install`.cwd(root), "bun install"),
    });
  }

  return { root, steps };
}

async function shell(command: ReturnType<typeof Bun.$>, label: string): Promise<void> {
  const result = await command.nothrow().quiet();
  if (result.exitCode !== 0) {
    const output = result.stderr.toString().trim() || result.stdout.toString().trim();
    throw new Error(`${label} failed (exit code ${result.exitCode})${output ? `\n${output}` : ""}`);
  }
}

export async function init(options: InitOptions): Promise<string> {
  const { root, steps } = await planInit(options);
  for (const step of steps) await step.run();
  return root;
}
