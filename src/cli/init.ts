import { relative } from "node:path";
import * as p from "@clack/prompts";
import { BACKENDS, isBackendType, type BackendAdapter, type BackendType } from "../backends/index.ts";
import { planInit, validateEnvironmentName, validateProjectName, DEFAULT_ENVIRONMENT, type InitOptions } from "../commands/init.ts";
import { ENTITY_TYPES } from "../entities.ts";
import { answer, ask, choose, given, interactive, intro, option, printUrl, required, runWithSpinner } from "./prompts.ts";

export async function initCommand(
  nameArg: string | undefined,
  flags: { skipInstall?: boolean; skipGit?: boolean; backend?: string; environment?: string },
): Promise<void> {
  // Flags are checked before anything is asked.
  const backends = Object.keys(BACKENDS)
    .filter(isBackendType)
    .map((type) => ({ key: type, label: BACKENDS[type].label, value: type }));
  const presetBackend =
    flags.backend === undefined ? undefined : option(backends, flags.backend, (type) => `Unknown backend "${type}".`);

  intro("init");

  const name = await ask({
    label: "Project name",
    value: nameArg,
    placeholder: "my-project",
    required: 'Project name is required: "framer init <name>".',
    validate: validateProjectName,
  });
  const environment = await ask({
    label: "First environment",
    value: flags.environment,
    default: DEFAULT_ENVIRONMENT,
    validate: validateEnvironmentName,
  });
  const git = !flags.skipGit && (!interactive || answer(await p.confirm({ message: "Initialize a git repository?" })));
  const install = !flags.skipInstall && (!interactive || answer(await p.confirm({ message: "Install dependencies?" })));
  const backend = await connectBackend(
    await choose("Backend (where framer stores generated envs)", backends, presetBackend),
  );

  const { root, steps } = await planInit({ name, environment, git, install, backend });
  await runWithSpinner(steps);

  const types = Object.values(ENTITY_TYPES);
  const width = Math.max(...types.map(({ dir }) => dir.length)) + 2;
  p.note(
    [
      `framer.json   project config (environments: ${environment})`,
      ".env          backend credentials (gitignored)",
      "package.json  bun workspaces",
      "turbo.json    turborepo tasks",
      "",
      ...types.map(({ dir, description }) => `${`${dir}/`.padEnd(width)}${description}`),
    ].join("\n"),
    name,
  );

  const next = [`cd ${relative(process.cwd(), root) || "."}`];
  if (!install) next.push("bun install");
  p.outro(`Next: ${next.join(" && ")}`);
}

/** Gets the backend's credential: from the environment, a browser login, or pasted. */
async function connectBackend(type: BackendType): Promise<InitOptions["backend"]> {
  const adapter = BACKENDS[type];
  const key = adapter.credentialKey;
  let credential = process.env[key];
  if (credential) {
    given(`${adapter.label} auth`, `using ${key} from the environment`);
  } else {
    if (!interactive) throw new Error(`${key} is required when not running interactively.`);
    const method = answer(
      await p.select({
        message: `Connect ${adapter.label}`,
        options: [
          { value: "login", label: `${adapter.loginLabel} (browser)` },
          { value: "paste", label: `Paste ${key}`, hint: adapter.credentialHint },
        ],
      }),
    );
    credential =
      method === "login" ? await login(adapter) : answer(await p.password({ message: key, validate: required })).trim();
  }

  return { type, credentials: { [key]: credential }, client: adapter.connect(credential) };
}

async function login(adapter: BackendAdapter): Promise<string> {
  const spinner = p.spinner();
  let waiting = false;
  try {
    const credential = await adapter.login((url) => {
      p.log.info("Opening your browser to log in. If it doesn't open, visit:");
      printUrl(url);
      spinner.start(`Waiting for ${adapter.label} login`);
      waiting = true;
    });
    spinner.stop(`Logged in to ${adapter.label}`);
    return credential;
  } catch (error) {
    if (waiting) spinner.error(`${adapter.label} login failed`);
    throw error;
  }
}
