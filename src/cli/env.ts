import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { loadBackend } from "../backends/index.ts";
import { ignoreCustomEnvFiles, planEnv } from "../commands/env.ts";
import { findProjectRoot, readProjectConfig } from "../config.ts";
import { CUSTOM_ENV_IGNORE } from "../dotenv.ts";
import { parseEntityType } from "../entities.ts";
import { intro, runWithSpinner } from "./prompts.ts";

export async function envCommand(typeArg: string | undefined, nameArg: string | undefined): Promise<void> {
  if (!typeArg || !nameArg) throw new Error('Usage: "framer env <type> <name>", e.g. "framer env app web".');
  const type = parseEntityType(typeArg);

  intro(`env ${type} ${nameArg}`);

  const root = await findProjectRoot();
  const config = await readProjectConfig(root);
  const backend = await loadBackend(root, config);
  const { path, steps, pushed, skipped } = await planEnv({ root, config, type, name: nameArg, backend });

  if (await ignoreCustomEnvFiles(root, path)) {
    p.log.warn(`${path}/.env.* files weren't ignored by git. Added ${CUSTOM_ENV_IGNORE.join(", ")} to .gitignore.`);
  }
  await runWithSpinner(steps);

  p.note(
    [
      ...pushed.flatMap(({ env, keys }) => [`${env}:`, ...(keys.length ? keys.map((key) => `  ${key}`) : ["  (empty)"])]),
      ...(skipped.length ? ["", styleText("dim", `no file, left as is: ${skipped.join(", ")}`)] : []),
    ].join("\n"),
    "Custom envs",
  );
  p.outro(`Pushed custom envs of ${path}`);
}
