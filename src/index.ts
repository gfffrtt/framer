#!/usr/bin/env bun
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import { addCommand } from "./cli/add.ts";
import { envCommand } from "./cli/env.ts";
import { initCommand } from "./cli/init.ts";
import { monochrome } from "./ui.ts";

monochrome();

const HELP = `framer — Turborepo for infrastructure

Usage:
  framer init [name] [--environment prod] [--backend google-drive] [--skip-install] [--skip-git]
  framer add app [name] [--create "<command>"] [--cloud vercel]
  framer add bucket [name] [--cloud cloudflare]
  framer env <type> <name>     Push <type-dir>/<name>/.env.<env> files to the backend
  framer help                  Show this help

Options:
  -h, --help    Show this help
`;

async function main(argv: string[]): Promise<void> {
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
  if (values.help || !command || command === "help") {
    console.log(HELP);
    return;
  }

  const commands: Record<string, () => Promise<void>> = {
    init: () =>
      initCommand(rest[0], {
        skipInstall: values["skip-install"],
        skipGit: values["skip-git"],
        backend: values.backend,
        environment: values.environment,
      }),
    add: () => addCommand(rest[0], rest[1], { cloud: values.cloud, create: values.create }),
    env: () => envCommand(rest[0], rest[1]),
  };
  if (!Object.hasOwn(commands, command)) throw new Error(`Unknown command "${command}". Run "framer --help".`);
  await commands[command]!();
}

try {
  await main(Bun.argv.slice(2));
} catch (error) {
  p.cancel(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
