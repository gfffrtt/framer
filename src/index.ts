#!/usr/bin/env bun
import { parseArgs, styleText } from "node:util";
import { exists } from "node:fs/promises";
import { join, relative } from "node:path";
import * as p from "@clack/prompts";
import {
  planInit,
  validateEnvironmentName,
  validateProjectName,
  DEFAULT_ENVIRONMENT,
  type InitOptions,
  type InitStep,
} from "./commands/init.ts";
import { entityPath, isEmptyDir, planAdd, runCreateCommand } from "./commands/add.ts";
import { ENV_FILES_IGNORE, ignoreCustomEnvFiles, planEnv } from "./commands/env.ts";
import { BACKENDS, loadBackend } from "./backends/index.ts";
import { googleDrive, login } from "./backends/google-drive.ts";
import {
  CLOUDS,
  credentialKey,
  credentialName,
  type ClientOf,
  type Cloud,
  type CloudCredentials,
  type CloudName,
  type CredentialTarget,
} from "./clouds/index.ts";
import { openBrowser } from "./browser.ts";
import { findProjectRoot, readProjectConfig, type BackendType } from "./config.ts";
import { readRootEnv, updateRootEnv } from "./dotenv.ts";
import { ENTITY_TYPES, validateName, type EntityType } from "./entities.ts";
import { PROVISIONERS } from "./provisioners/index.ts";
import { monochrome } from "./ui.ts";

monochrome();

const HELP = `framer — Turborepo for infrastructure

Usage:
  framer init [name] [--environment prod] [--backend google-drive] [--skip-install] [--skip-git]
  framer add app [name] [--create "<command>"] [--cloud vercel]
  framer add bucket [name] [--cloud cloudflare]
  framer env <type> <name>     Push <type-dir>/<name>/.env.<env> files to the backend

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

/**
 * Reads a cloud's credentials for one entity in one environment from the root `.env`
 * (or the process env), guiding the user to create them if missing. Only the exact
 * keys are read, e.g. `CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS` (ADR 0023).
 */
async function cloudCredentials(root: string, cloudName: CloudName, target: CredentialTarget): Promise<CloudCredentials> {
  const cloud: Cloud<{ verify(): Promise<void> }> = CLOUDS[cloudName];
  const tokenKey = credentialKey(cloud.tokenKey, target);
  const scopeKey = credentialKey(cloud.scopeKey, target);
  const tokenName = credentialName(target);
  const tokenUrl = cloud.tokenUrl(tokenName);
  const env = { ...process.env, ...(await readRootEnv(root)) };
  let token = env[tokenKey];
  let scope = env[scopeKey];
  if (token && scope) {
    p.log.step(`${cloud.label} credentials for ${target.env}\n${styleText("dim", `${tokenKey}, ${scopeKey}`)}`);
    return { token, scope };
  }
  if (!interactive) {
    throw new Error(`${tokenKey} and ${scopeKey} are required in the root .env.\nCreate a token named ${tokenName} at:\n${tokenUrl}`);
  }

  const saved: Record<string, string> = {};

  if (!token) {
    p.note(
      [
        `framer needs a ${cloud.label} token for ${target.purpose}/${target.name} in ${target.env}.`,
        "",
        ...cloud.tokenSteps(tokenName),
      ].join("\n"),
      `${cloud.label} token for ${target.env}`,
    );
    printUrl(tokenUrl);
    openBrowser(tokenUrl);
    token = answer(
      await p.password({ message: tokenKey, validate: (input) => (input?.trim() ? undefined : "Required.") }),
    ).trim();
    saved[tokenKey] = token;
  }

  if (!scope) {
    const label = `${cloud.label} ${cloud.scopeLabel} for ${target.env}`;
    const scopes = await cloud.listScopes(token);
    if (scopes.length === 1) {
      scope = scopes[0]!.id;
      p.log.step(`${label}\n${styleText("dim", `${scopes[0]!.name} (${scope})`)}`);
    } else if (scopes.length > 1) {
      scope = answer(
        await p.select({
          message: label,
          options: scopes.map((candidate) => ({ value: candidate.id, label: candidate.name, hint: candidate.id })),
        }),
      );
    } else {
      scope = answer(await p.text({ message: scopeKey, validate: (input) => (input?.trim() ? undefined : "Required.") })).trim();
    }
    saved[scopeKey] = scope;
  }

  await updateRootEnv(root, saved);
  p.log.step(`Saved ${Object.keys(saved).join(" and ")} to .env`);
  return { token, scope };
}

const NAME_PLACEHOLDERS: Partial<Record<EntityType, string>> = { app: "web", bucket: "uploads" };

/** An app's code comes from a create command the user picks, run inside `apps/<name>`. */
async function scaffoldApp(dir: string, path: string, createArg: string | undefined): Promise<void> {
  if (!(await isEmptyDir(dir))) {
    // Left behind by an earlier run whose provisioning failed: reuse it.
    if (createArg !== undefined) throw new Error(`${path} already has files. Remove it or drop --create.`);
    const reuse = !interactive || answer(await p.confirm({ message: `${path} already has files. Deploy them as they are?` }));
    if (!reuse) throw new Error(`Remove ${path} or pick another name.`);
    p.log.step(`Create command\n${styleText("dim", `skipped, using the files in ${path}`)}`);
    return;
  }

  let command = createArg;
  if (command === undefined) {
    if (!interactive) throw new Error('A create command is required: --create "bun create vite .".');
    command = answer(
      await p.text({
        message: `Create command ${styleText("dim", `(runs inside ${path}, so target ".")`)}`,
        placeholder: "bunx create-next-app@latest .",
        validate: (value) => (value?.trim() ? undefined : "Required."),
      }),
    ).trim();
  } else {
    p.log.step(`Create command\n${styleText("dim", command)}`);
  }

  p.log.info(`Running ${command} in ${path}`);
  await runCreateCommand(dir, command);
  p.log.step(`Created ${path}`);
}

async function addCommand(
  typeArg: string | undefined,
  nameArg: string | undefined,
  flags: { cloud?: string; create?: string },
) {
  if (!typeArg) throw new Error('Usage: "framer add <type> [name]".');
  const entityType = ENTITY_TYPES.find((candidate) => candidate.type === typeArg);
  if (!entityType) throw new Error(`Unknown entity type "${typeArg}".`);
  const type = entityType.type;
  const clouds: CloudName[] = (PROVISIONERS[type] ?? []).map((provisioner) => provisioner.cloud);
  if (clouds.length === 0) throw new Error(`"framer add ${type}" is not supported yet.`);
  if (flags.cloud !== undefined && !clouds.includes(flags.cloud as CloudName)) {
    throw new Error(`Cloud "${flags.cloud}" is not supported for ${type}s yet. Available: ${clouds.join(", ")}.`);
  }
  if (flags.create !== undefined && type !== "app") throw new Error("--create only applies to apps.");

  p.intro(styleText("inverse", " framer ") + ` add ${type}`);

  const root = await findProjectRoot();
  const config = await readProjectConfig(root);
  const backend = await loadBackend(root, config);
  const title = `${type[0]!.toUpperCase()}${type.slice(1)}`;

  // 1. Name.
  let name = nameArg;
  if (name === undefined) {
    if (!interactive) throw new Error(`Entity name is required: "framer add ${type} <name>".`);
    name = answer(
      await p.text({
        message: `${title} name`,
        placeholder: NAME_PLACEHOLDERS[type] ?? "main",
        validate: (value) => validateName(value?.trim() ?? "", "Entity name") ?? undefined,
      }),
    ).trim();
  } else {
    p.log.step(`${title} name\n${styleText("dim", name)}`);
  }
  const error = validateName(name, "Entity name");
  if (error) throw new Error(error);
  const path = entityPath(type, name);
  const dir = join(root, path);
  if (await exists(join(dir, "framer.json"))) throw new Error(`${path} already exists.`);

  // 2. Code (apps only).
  if (type === "app") await scaffoldApp(dir, path, flags.create);

  // 3. Cloud.
  let cloud: CloudName;
  if (flags.cloud === undefined && interactive) {
    cloud = answer(
      await p.select({
        message: type === "app" ? "Deploy to" : "Cloud",
        options: clouds.map((value) => ({ value, label: CLOUDS[value].label })),
      }),
    );
  } else {
    cloud = (flags.cloud as CloudName | undefined) ?? clouds[0]!;
    p.log.step(`Cloud\n${styleText("dim", CLOUDS[cloud].label)}`);
  }

  // 4. Cloud credentials, one set per environment (opens the provider's page when they are missing).
  const clients: Record<string, ClientOf<CloudName>> = {};
  for (const env of config.environments) {
    const target = { project: config.name, env, purpose: entityType.dir, name };
    clients[env] = CLOUDS[cloud].connect(await cloudCredentials(root, cloud, target));
  }

  // 5. Provision in every environment.
  const { steps, keys } = await planAdd({ root, config, type, name, cloud, clients, backend });
  await runSteps(steps);

  // 6. Summary of the generated envs, so the user knows their names.
  p.note(
    [
      ...keys,
      "",
      styleText("dim", "stored in the backend:"),
      ...config.environments.map((env) => styleText("dim", `.framer/${config.name}/${env}.env`)),
    ].join("\n"),
    "Generated envs",
  );
  p.outro(`Added ${type} ${name}`);
}

async function envCommand(typeArg: string | undefined, nameArg: string | undefined) {
  if (!typeArg || !nameArg) throw new Error('Usage: "framer env <type> <name>", e.g. "framer env app web".');
  const entityType = ENTITY_TYPES.find((candidate) => candidate.type === typeArg);
  if (!entityType) throw new Error(`Unknown entity type "${typeArg}".`);

  p.intro(styleText("inverse", " framer ") + ` env ${entityType.type} ${nameArg}`);

  const root = await findProjectRoot();
  const config = await readProjectConfig(root);
  const backend = await loadBackend(root, config);
  const { path, steps, pushed, skipped } = await planEnv({ root, config, type: entityType.type, name: nameArg, backend });

  if (await ignoreCustomEnvFiles(root, path)) {
    p.log.warn(`${path}/.env.* files weren't ignored by git. Added ${ENV_FILES_IGNORE.join(", ")} to .gitignore.`);
  }
  await runSteps(steps);

  p.note(
    [
      ...pushed.flatMap(({ env, keys }) => [`${env}:`, ...(keys.length ? keys.map((key) => `  ${key}`) : ["  (empty)"])]),
      ...(skipped.length ? ["", styleText("dim", `no file, left as is: ${skipped.join(", ")}`)] : []),
    ].join("\n"),
    "Custom envs",
  );
  p.outro(`Pushed custom envs of ${path}`);
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
      create: { type: "string" },
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
        await addCommand(rest[0], rest[1], { cloud: values.cloud, create: values.create });
      } catch (error) {
        p.cancel(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      return;
    }
    case "env": {
      try {
        await envCommand(rest[0], rest[1]);
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
