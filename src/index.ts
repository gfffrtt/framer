#!/usr/bin/env bun
import { parseArgs, styleText } from "node:util";
import { relative } from "node:path";
import * as p from "@clack/prompts";
import { planInit, validateProjectName, type InitOptions, type InitStep } from "./commands/init.ts";
import { planAdd, isSupportedType, SUPPORTED, type AddCloud } from "./commands/add.ts";
import { BACKENDS, loadBackend } from "./backends/index.ts";
import { googleDrive, login } from "./backends/google-drive.ts";
import { cloudflare, CLOUDFLARE_TOKEN_PERMISSIONS } from "./clouds/cloudflare.ts";
import { findProjectRoot, readProjectConfig, type BackendType } from "./config.ts";
import { readRootEnv, updateRootEnv } from "./dotenv.ts";
import { ENTITY_TYPES } from "./entities.ts";
import { monochrome } from "./ui.ts";

monochrome();

const HELP = `framer — Turborepo for infrastructure

Usage:
  framer init [name] [--backend google-drive] [--skip-install] [--skip-git]
  framer add bucket <name> [--cloud cloudflare]

Options:
  -h, --help    Show this help
`;

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Exits cleanly when the user presses Ctrl+C / Esc on a prompt. */
function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

async function runSteps(steps: InitStep[]) {
  const spinner = p.spinner();
  for (const step of steps) {
    spinner.start(step.title);
    try {
      await step.run();
    } catch (error) {
      spinner.error(step.title);
      throw error;
    }
    spinner.stop(step.done);
  }
}

/** Asks which backend to use and gets its credentials (logging in if needed). */
async function chooseBackend(backendArg: string | undefined): Promise<InitOptions["backend"]> {
  let type: BackendType;
  if (backendArg !== undefined) {
    const backend = BACKENDS.find((candidate) => candidate.type === backendArg);
    if (!backend) throw new Error(`Unknown backend "${backendArg}". Available: ${BACKENDS.map((b) => b.type).join(", ")}.`);
    type = backend.type;
  } else if (interactive) {
    type = answer(
      await p.select({
        message: "Backend (where framer stores generated envs)",
        options: BACKENDS.map((backend) => ({ value: backend.type, label: backend.label })),
      }),
    );
  } else {
    type = BACKENDS[0]!.type;
  }

  let googleAuth = process.env.GOOGLE_AUTH;
  if (googleAuth) {
    p.log.step(`Google auth\n${styleText("dim", "using GOOGLE_AUTH from the environment")}`);
  } else {
    if (!interactive) throw new Error("GOOGLE_AUTH is required when not running interactively.");
    const method = answer(
      await p.select({
        message: "Connect Google Drive",
        options: [
          { value: "login", label: "Log in with Google (browser)" },
          { value: "paste", label: "Paste GOOGLE_AUTH", hint: "base64 authorized_user JSON" },
        ],
      }),
    );
    if (method === "login") {
      const spinner = p.spinner();
      googleAuth = await login((url) => {
        p.log.info(`Opening your browser to log in. If it doesn't open, visit:\n${url}`);
        spinner.start("Waiting for Google login");
      }).finally(() => spinner.stop("Logged in with Google"));
    } else {
      googleAuth = answer(
        await p.password({ message: "GOOGLE_AUTH", validate: (value) => (value ? undefined : "Required.") }),
      ).trim();
    }
  }

  return { type, credentials: { GOOGLE_AUTH: googleAuth }, client: googleDrive(googleAuth) };
}

async function initCommand(
  nameArg: string | undefined,
  flags: { skipInstall?: boolean; skipGit?: boolean; backend?: string },
) {
  p.intro(styleText("inverse", " framer ") + " init");

  let name = nameArg;
  if (name === undefined) {
    if (!interactive) throw new Error('Project name is required: "framer init <name>".');
    name = answer(
      await p.text({
        message: "Project name",
        placeholder: "my-project",
        validate: (value) => validateProjectName(value?.trim() ?? "") ?? undefined,
      }),
    ).trim();
  } else {
    p.log.step(`Project name\n${styleText("dim", name)}`);
  }

  const git =
    flags.skipGit ? false : !interactive || answer(await p.confirm({ message: "Initialize a git repository?" }));
  const install =
    flags.skipInstall ? false : !interactive || answer(await p.confirm({ message: "Install dependencies?" }));

  const error = validateProjectName(name);
  if (error) throw new Error(error);
  const backend = await chooseBackend(flags.backend);

  const { root, steps } = await planInit({ name, git, install, backend });
  await runSteps(steps);

  const width = Math.max(...ENTITY_TYPES.map(({ dir }) => dir.length)) + 2;
  p.note(
    [
      "framer.json   project config (environments: dev, prod)",
      ".env          backend credentials (gitignored)",
      "package.json  bun workspaces",
      "turbo.json    turborepo tasks",
      "",
      ...ENTITY_TYPES.map(({ dir, description }) => `${`${dir}/`.padEnd(width)}${description}`),
    ].join("\n"),
    name,
  );

  const next = [`cd ${relative(process.cwd(), root) || "."}`];
  if (!install) next.push("bun install");
  p.outro(`Next: ${next.join(" && ")}`);
}

/** Reads a credential from the root `.env` / process env, or asks for it and saves it to the root `.env`. */
async function credential(root: string, key: string, message: string, secret: boolean): Promise<string> {
  const value = (await readRootEnv(root))[key] ?? process.env[key];
  if (value) return value;
  if (!interactive) throw new Error(`${key} is missing. Add it to the root .env.`);
  const prompt = secret ? p.password : p.text;
  const entered = answer(await prompt({ message, validate: (input) => (input?.trim() ? undefined : "Required.") })).trim();
  await updateRootEnv(root, { [key]: entered });
  p.log.step(`Saved ${key} to .env`);
  return entered;
}

async function addCommand(typeArg: string | undefined, name: string | undefined, cloudArg: string | undefined) {
  if (!typeArg || !name) throw new Error('Usage: "framer add <type> <name>".');
  if (!isSupportedType(typeArg)) {
    const known = ENTITY_TYPES.some((entityType) => entityType.type === typeArg);
    throw new Error(known ? `"framer add ${typeArg}" is not supported yet.` : `Unknown entity type "${typeArg}".`);
  }
  const clouds: readonly string[] = SUPPORTED[typeArg];
  const cloud = (cloudArg ?? clouds[0]) as AddCloud;
  if (!clouds.includes(cloud)) {
    throw new Error(`Cloud "${cloud}" is not supported for ${typeArg}s yet. Available: ${clouds.join(", ")}.`);
  }

  p.intro(styleText("inverse", " framer ") + ` add ${typeArg}`);

  const root = await findProjectRoot();
  const config = await readProjectConfig(root);
  const backend = await loadBackend(root, config);

  const accountId = await credential(root, "CLOUDFLARE_ACCOUNT_ID", "Cloudflare account ID", false);
  const apiToken = await credential(
    root,
    "CLOUDFLARE_API_TOKEN",
    `Cloudflare API token (needs ${CLOUDFLARE_TOKEN_PERMISSIONS})`,
    true,
  );

  const { steps, keys } = await planAdd({
    root,
    config,
    type: typeArg,
    name,
    cloud,
    backend,
    cloudflare: cloudflare({ accountId, apiToken }),
  });
  await runSteps(steps);

  p.note(
    config.environments.map((env) => `.framer/${config.name}/${env}.env`).join("\n") +
      "\n\n" +
      keys.join("\n"),
    "Generated envs",
  );
  p.outro(`Added ${typeArg} ${name}`);
}

async function main(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      "skip-install": { type: "boolean" },
      "skip-git": { type: "boolean" },
      backend: { type: "string" },
      cloud: { type: "string" },
    },
  });

  const [command, ...rest] = positionals;

  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  switch (command) {
    case "init": {
      try {
        await initCommand(rest[0], {
          skipInstall: values["skip-install"],
          skipGit: values["skip-git"],
          backend: values.backend,
        });
      } catch (error) {
        p.cancel(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      return;
    }
    case "add": {
      try {
        await addCommand(rest[0], rest[1], values.cloud);
      } catch (error) {
        p.cancel(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". Run "framer --help".`);
  }
}

try {
  await main(Bun.argv.slice(2));
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
