#!/usr/bin/env bun
import { parseArgs, styleText } from "node:util";
import { relative } from "node:path";
import * as p from "@clack/prompts";
import {
  planInit,
  validateEnvironmentName,
  validateProjectName,
  DEFAULT_ENVIRONMENT,
  type InitOptions,
  type InitStep,
} from "./commands/init.ts";
import { planAdd, isSupportedType, SUPPORTED, type AddCloud } from "./commands/add.ts";
import { BACKENDS, loadBackend } from "./backends/index.ts";
import { googleDrive, login } from "./backends/google-drive.ts";
import {
  cloudflare,
  listCloudflareAccounts,
  CLOUDFLARE_TOKEN_PERMISSIONS,
  cloudflareTokenUrl,
} from "./clouds/cloudflare.ts";
import { openBrowser } from "./browser.ts";
import { findProjectRoot, readProjectConfig, type BackendType } from "./config.ts";
import { readRootEnv, updateRootEnv } from "./dotenv.ts";
import { ENTITY_TYPES, validateName } from "./entities.ts";
import { monochrome } from "./ui.ts";

monochrome();

const HELP = `framer — Turborepo for infrastructure

Usage:
  framer init [name] [--environment prod] [--backend google-drive] [--skip-install] [--skip-git]
  framer add bucket [name] [--cloud cloudflare]

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

/** Prints a URL on its own line, outside clack's frame, so copying it doesn't pick up the `│` bars. */
function printUrl(url: string): void {
  process.stdout.write(`\n${url}\n\n`);
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
        p.log.info("Opening your browser to log in. If it doesn't open, visit:");
        printUrl(url);
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
  flags: { skipInstall?: boolean; skipGit?: boolean; backend?: string; environment?: string },
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

  let environment = flags.environment;
  if (environment === undefined && interactive) {
    environment = answer(
      await p.text({
        message: "First environment",
        placeholder: DEFAULT_ENVIRONMENT,
        defaultValue: DEFAULT_ENVIRONMENT,
        validate: (value) => (value?.trim() ? (validateEnvironmentName(value.trim()) ?? undefined) : undefined),
      }),
    ).trim();
  } else {
    environment ??= DEFAULT_ENVIRONMENT;
    p.log.step(`First environment\n${styleText("dim", environment)}`);
  }

  const git =
    flags.skipGit ? false : !interactive || answer(await p.confirm({ message: "Initialize a git repository?" }));
  const install =
    flags.skipInstall ? false : !interactive || answer(await p.confirm({ message: "Install dependencies?" }));

  const error = validateProjectName(name) ?? validateEnvironmentName(environment);
  if (error) throw new Error(error);
  const backend = await chooseBackend(flags.backend);

  const { root, steps } = await planInit({ name, environment, git, install, backend });
  await runSteps(steps);

  const width = Math.max(...ENTITY_TYPES.map(({ dir }) => dir.length)) + 2;
  p.note(
    [
      `framer.json   project config (environments: ${environment})`,
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

/** Reads Cloudflare credentials from the root `.env` / process env, guiding the user to create them if missing. */
async function cloudflareCredentials(
  root: string,
  purpose: string,
): Promise<{ accountId: string; apiToken: string }> {
  const tokenUrl = cloudflareTokenUrl(purpose);
  const env = { ...process.env, ...(await readRootEnv(root)) };
  let apiToken = env.CLOUDFLARE_API_TOKEN;
  let accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (apiToken && accountId) return { accountId, apiToken };
  if (!interactive) {
    throw new Error(
      `CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required in the root .env.\nCreate a token (${CLOUDFLARE_TOKEN_PERMISSIONS}) at:\n${tokenUrl}`,
    );
  }

  const saved: Record<string, string> = {};

  if (!apiToken) {
    p.note(
      [
        "framer needs a Cloudflare API token to create R2 buckets.",
        "",
        `1. A browser tab is opening (link below if it doesn't). The permissions`,
        `   (${CLOUDFLARE_TOKEN_PERMISSIONS}) are already filled in.`,
        "   Pick your account if asked.",
        '2. Click "Continue to summary", then "Create token".',
        "3. Copy the token and paste it here.",
      ].join("\n"),
      "Cloudflare API token",
    );
    printUrl(tokenUrl);
    openBrowser(tokenUrl);
    apiToken = answer(
      await p.password({ message: "Cloudflare API token", validate: (input) => (input?.trim() ? undefined : "Required.") }),
    ).trim();
    saved.CLOUDFLARE_API_TOKEN = apiToken;
  }

  if (!accountId) {
    const accounts = await listCloudflareAccounts(apiToken);
    if (accounts.length === 1) {
      accountId = accounts[0]!.id;
      p.log.step(`Cloudflare account\n${styleText("dim", `${accounts[0]!.name} (${accountId})`)}`);
    } else if (accounts.length > 1) {
      accountId = answer(
        await p.select({
          message: "Cloudflare account",
          options: accounts.map((account) => ({ value: account.id, label: account.name, hint: account.id })),
        }),
      );
    } else {
      accountId = answer(
        await p.text({
          message: "Cloudflare account ID",
          placeholder: "shown on dash.cloudflare.com → Account home, or in the dashboard URL",
          validate: (input) => (input?.trim() ? undefined : "Required."),
        }),
      ).trim();
    }
    saved.CLOUDFLARE_ACCOUNT_ID = accountId;
  }

  await updateRootEnv(root, saved);
  p.log.step(`Saved ${Object.keys(saved).join(" and ")} to .env`);
  return { accountId, apiToken };
}

async function addCommand(typeArg: string | undefined, nameArg: string | undefined, cloudArg: string | undefined) {
  if (!typeArg) throw new Error('Usage: "framer add <type> [name]".');
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
  const typeDir = ENTITY_TYPES.find((entityType) => entityType.type === typeArg)!.dir;

  // 1. Name.
  let name = nameArg;
  if (name === undefined) {
    if (!interactive) throw new Error(`Entity name is required: "framer add ${typeArg} <name>".`);
    name = answer(
      await p.text({
        message: `${typeArg[0]!.toUpperCase()}${typeArg.slice(1)} name`,
        placeholder: typeArg === "bucket" ? "uploads" : "main",
        validate: (value) => validateName(value?.trim() ?? "", "Entity name") ?? undefined,
      }),
    ).trim();
  } else {
    p.log.step(`${typeArg[0]!.toUpperCase()}${typeArg.slice(1)} name\n${styleText("dim", name)}`);
  }

  // 2. Cloud credentials (opens the provider's page when they are missing).
  const { accountId, apiToken } = await cloudflareCredentials(root, typeDir);

  const { steps, keys } = await planAdd({
    root,
    config,
    type: typeArg,
    name,
    cloud,
    backend,
    cloudflare: cloudflare({ accountId, apiToken }),
  });
  // 3. Provision in every environment.
  await runSteps(steps);

  // 4. Summary of the generated envs, so the user knows their names.
  p.note(
    [
      ...keys,
      "",
      styleText("dim", "stored in the backend:"),
      ...config.environments.map((env) => styleText("dim", `.framer/${config.name}/${env}.env`)),
    ].join("\n"),
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
      environment: { type: "string" },
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
          environment: values.environment,
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
