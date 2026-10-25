import * as p from "@clack/prompts";
import { openBrowser } from "../browser.ts";
import type { Cloud, CloudCredentials } from "../clouds/index.ts";
import type { ProjectConfig } from "../config.ts";
import { readRootEnv, updateRootEnv, type EnvVars } from "../dotenv.ts";
import type { Entity } from "../entities.ts";
import { credentialKey, credentialName, credentialTarget, type CredentialTarget } from "../naming.ts";
import { answer, given, interactive, printUrl, required } from "./prompts.ts";

/**
 * Reads a cloud's credentials for one entity, one set per environment, from the
 * root `.env` (or the process env), guiding the user to create the missing ones.
 * Only the exact keys are read, e.g. `CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS` (ADR 0023).
 */
export async function cloudCredentials(
  root: string,
  config: ProjectConfig,
  cloud: Cloud,
  entity: Entity,
): Promise<Record<string, CloudCredentials>> {
  const known = { ...process.env, ...(await readRootEnv(root)) };
  const credentials: Record<string, CloudCredentials> = {};
  for (const env of config.environments) {
    credentials[env] = await credentialsFor(root, known, cloud, credentialTarget(config.name, env, entity));
  }
  return credentials;
}

async function credentialsFor(
  root: string,
  known: Record<string, string | undefined>,
  cloud: Cloud,
  target: CredentialTarget,
): Promise<CloudCredentials> {
  const tokenKey = credentialKey(cloud.tokenKey, target);
  const scopeKey = credentialKey(cloud.scopeKey, target);
  let token = known[tokenKey];
  let scope = known[scopeKey];
  if (token && scope) {
    given(`${cloud.label} credentials for ${target.env}`, `${tokenKey}, ${scopeKey}`);
    return { token, scope };
  }
  if (!interactive) {
    const tokenName = credentialName(target);
    throw new Error(
      `${tokenKey} and ${scopeKey} are required in the root .env.\nCreate a token named ${tokenName} at:\n${cloud.tokenUrl(tokenName)}`,
    );
  }

  const saved: EnvVars = {};
  if (!token) token = saved[tokenKey] = await askToken(cloud, target, tokenKey);
  if (!scope) scope = saved[scopeKey] = await askScope(cloud, target, token, scopeKey);
  await updateRootEnv(root, saved);
  p.log.step(`Saved ${Object.keys(saved).join(" and ")} to .env`);
  return { token, scope };
}

/** Opens the cloud's token page, pre-filled when possible, and asks for the token. */
async function askToken(cloud: Cloud, target: CredentialTarget, tokenKey: string): Promise<string> {
  const tokenName = credentialName(target);
  const tokenUrl = cloud.tokenUrl(tokenName);
  p.note(
    [`framer needs a ${cloud.label} token for ${target.purpose}/${target.name} in ${target.env}.`, "", ...cloud.tokenSteps(tokenName)].join(
      "\n",
    ),
    `${cloud.label} token for ${target.env}`,
  );
  printUrl(tokenUrl);
  openBrowser(tokenUrl);
  return answer(await p.password({ message: tokenKey, validate: required })).trim();
}

/** Looks up the accounts/teams the token can access; asks only when there isn't exactly one. */
async function askScope(cloud: Cloud, target: CredentialTarget, token: string, scopeKey: string): Promise<string> {
  const label = `${cloud.label} ${cloud.scopeLabel} for ${target.env}`;
  const scopes = await cloud.listScopes(token);
  if (scopes.length === 1) {
    given(label, `${scopes[0]!.name} (${scopes[0]!.id})`);
    return scopes[0]!.id;
  }
  if (scopes.length > 1) {
    return answer(
      await p.select({
        message: label,
        options: scopes.map((scope) => ({ value: scope.id, label: scope.name, hint: scope.id })),
      }),
    );
  }
  return answer(await p.text({ message: scopeKey, validate: required })).trim();
}
