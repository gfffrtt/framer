#!/usr/bin/env bun
import { parseArgs, styleText } from "node:util";
import { relative } from "node:path";
import * as p from "@clack/prompts";
import { planInit, validateProjectName, ENTITY_TYPES } from "./commands/init.ts";
import { monochrome } from "./ui.ts";

monochrome();

const HELP = `framer — Turborepo for infrastructure

Usage:
  framer init [name] [--skip-install] [--skip-git]

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

async function initCommand(nameArg: string | undefined, flags: { skipInstall?: boolean; skipGit?: boolean }) {
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

  const { root, steps } = await planInit({ name, git, install });

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

  const width = Math.max(...ENTITY_TYPES.map(({ dir }) => dir.length)) + 2;
  p.note(
    [
      "framer.json   project config",
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

async function main(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      "skip-install": { type: "boolean" },
      "skip-git": { type: "boolean" },
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
        await initCommand(rest[0], { skipInstall: values["skip-install"], skipGit: values["skip-git"] });
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
