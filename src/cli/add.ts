import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { loadBackend } from "../backends/index.ts";
import { planAdd, runCreateCommand } from "../commands/add.ts";
import { findProjectRoot, readProjectConfig } from "../config.ts";
import { ENTITY_TYPES, entityTypesWith, newEntity, parseEntityType, validateName, type Entity } from "../entities.ts";
import { isEmptyDir } from "../files.ts";
import { PROVISIONERS } from "../provisioners/index.ts";
import { cloudCredentials } from "./credentials.ts";
import { answer, ask, choose, given, interactive, intro, option, runWithSpinner } from "./prompts.ts";

/** The add flow (ADR 0024): name → code → cloud → credentials → provision → summary. */
export async function addCommand(
  typeArg: string | undefined,
  nameArg: string | undefined,
  flags: { cloud?: string; create?: string },
): Promise<void> {
  if (!typeArg) throw new Error('Usage: "framer add <type> [name]".');
  const type = parseEntityType(typeArg);
  const traits = ENTITY_TYPES[type];
  const clouds = PROVISIONERS[type].map((provisioner) => ({
    key: provisioner.cloud.name,
    label: provisioner.cloud.label,
    value: provisioner,
  }));
  if (clouds.length === 0) throw new Error(`"framer add ${type}" is not supported yet.`);
  // Flags are checked before anything runs, so a typo doesn't fail after the create command.
  const presetCloud =
    flags.cloud === undefined ? undefined : (
      option(clouds, flags.cloud, (cloud) => `Cloud "${cloud}" is not supported for ${traits.dir} yet.`)
    );
  if (flags.create !== undefined && !traits.createCommand) {
    throw new Error(`--create only applies to ${entityTypesWith("createCommand")}.`);
  }

  intro(`add ${type}`);
  const root = await findProjectRoot();
  const config = await readProjectConfig(root);
  const backend = await loadBackend(root, config);

  // 1. Name.
  const name = await ask({
    label: `${type[0]!.toUpperCase()}${type.slice(1)} name`,
    value: nameArg,
    placeholder: traits.placeholder,
    required: `Entity name is required: "framer add ${type} <name>".`,
    validate: (value) => validateName(value, "Entity name"),
  });
  const entity = await newEntity(root, type, name);

  // 2. Code.
  if (traits.createCommand) await createCode(entity, flags.create);

  // 3. Cloud.
  const provisioner = await choose(traits.cloudQuestion, clouds, presetCloud);

  // 4. Credentials, one set per environment (opens the provider's page when they are missing).
  const credentials = await cloudCredentials(root, config, provisioner.cloud, entity);
  const connections = Object.fromEntries(
    Object.entries(credentials).map(([env, envCredentials]) => [env, provisioner.connect(envCredentials)]),
  );

  // 5. Provision in every environment.
  const { steps, keys } = await planAdd({ root, config, entity, provisioner, connections, backend });
  await runWithSpinner(steps);

  // 6. Summary of the generated envs, so the user knows their names.
  p.note(
    [
      ...keys,
      "",
      styleText("dim", "stored in the backend:"),
      ...config.environments.map((env) => styleText("dim", backend.location(config.name, env))),
    ].join("\n"),
    "Generated envs",
  );
  p.outro(`Added ${type} ${name}`);
}

/** The entity's code comes from a create command the user picks, run inside its folder. */
async function createCode({ dir, path }: Entity, createArg: string | undefined): Promise<void> {
  if (!(await isEmptyDir(dir))) {
    // Left behind by an earlier run whose provisioning failed: reuse it.
    if (createArg !== undefined) throw new Error(`${path} already has files. Remove it or drop --create.`);
    const reuse = !interactive || answer(await p.confirm({ message: `${path} already has files. Deploy them as they are?` }));
    if (!reuse) throw new Error(`Remove ${path} or pick another name.`);
    given("Create command", `skipped, using the files in ${path}`);
    return;
  }

  const command = await ask({
    label: "Create command",
    value: createArg,
    hint: `(runs inside ${path}, so target ".")`,
    placeholder: "bunx create-next-app@latest .",
    required: 'A create command is required: --create "bun create vite .".',
  });
  p.log.info(`Running ${command} in ${path}`);
  await runCreateCommand(dir, command);
  p.log.step(`Created ${path}`);
}
