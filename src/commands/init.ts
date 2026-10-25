import { mkdir, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export const ENTITY_TYPES = [
  { type: "app", dir: "apps", description: "long-running services" },
  { type: "db", dir: "dbs", description: "databases" },
  { type: "bucket", dir: "buckets", description: "object storage" },
  { type: "job", dir: "jobs", description: "scheduled (cron) work" },
  { type: "task", dir: "tasks", description: "one-off or triggered work" },
] as const;

export const ENTITY_DIRS = ENTITY_TYPES.map((entityType) => entityType.dir);

const TURBO_VERSION = "^2.11.10";
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export type InitOptions = {
  name: string;
  /** Parent directory the project folder is created in. */
  cwd?: string;
  install?: boolean;
  git?: boolean;
};

export function validateProjectName(name: string): string | null {
  if (!name) return "Project name is required.";
  if (name.length > 214) return "Project name must be at most 214 characters.";
  if (!NAME_PATTERN.test(name)) {
    return "Project name must be lowercase and contain only letters, numbers and dashes.";
  }
  return null;
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

function projectFiles(name: string): Record<string, string> {
  return {
    "framer.json": json({ name }),
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
  const { name, cwd = process.cwd(), install = true, git = true } = options;

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
        for (const [path, content] of Object.entries(projectFiles(name))) {
          await Bun.write(join(root, path), content);
        }
      },
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
