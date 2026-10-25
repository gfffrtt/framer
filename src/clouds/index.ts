import {
  cloudflare,
  cloudflareTokenUrl,
  listCloudflareAccounts,
  CLOUDFLARE_TOKEN_PERMISSIONS,
} from "./cloudflare.ts";
import { listVercelTeams, vercel, vercelTokenUrl } from "./vercel.ts";

/** What framer needs from every cloud: a token, and the account/team it acts on. */
export type CloudCredentials = { token: string; scope: string };

/** What one set of credentials is for: one entity in one environment. */
export type CredentialTarget = {
  project: string;
  env: string;
  /** The entity-type folder, e.g. `buckets`. */
  purpose: string;
  /** The entity name, e.g. `uploads`. */
  name: string;
};

/**
 * The root `.env` key of a credential for one entity in one environment, e.g.
 * `CLOUDFLARE_API_TOKEN` → `CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS`. framer only
 * reads this exact key: there is no fallback to a less specific one (ADR 0023).
 */
export function credentialKey(key: string, { env, purpose, name }: CredentialTarget): string {
  return [key, env, purpose, name].join("_").toUpperCase().replace(/-/g, "_");
}

/** The name the user gives the token in the cloud's dashboard: `framer-<project>-<env>-<purpose>-<name>`. */
export function credentialName({ project, env, purpose, name }: CredentialTarget): string {
  return `framer-${project}-${env}-${purpose}-${name}`;
}

/**
 * A cloud framer can provision on. Describes how the add flow gets its credentials
 * (ADR 0024) and how to build its API client from them.
 */
export type Cloud<Client extends { verify(): Promise<void> }> = {
  label: string;
  /** Base names of the root `.env` keys holding the token and the account/team id (see `credentialKey`). */
  tokenKey: string;
  scopeKey: string;
  /** What the cloud calls the scope: "account", "team"… */
  scopeLabel: string;
  /** The page where the user creates a token named `tokenName`, pre-filled when possible. */
  tokenUrl(tokenName: string): string;
  /** Steps shown while that page is open. */
  tokenSteps(tokenName: string): string[];
  /** Scopes the token can access, so the user doesn't have to look up the id. */
  listScopes(token: string): Promise<{ id: string; name: string }[]>;
  connect(credentials: CloudCredentials): Client;
};

function defineCloud<Client extends { verify(): Promise<void> }>(cloud: Cloud<Client>): Cloud<Client> {
  return cloud;
}

export const CLOUDS = {
  cloudflare: defineCloud({
    label: "Cloudflare",
    tokenKey: "CLOUDFLARE_API_TOKEN",
    scopeKey: "CLOUDFLARE_ACCOUNT_ID",
    scopeLabel: "account",
    tokenUrl: cloudflareTokenUrl,
    tokenSteps: () => [
      "1. A browser tab is opening (link below if it doesn't). The name and",
      `   permissions (${CLOUDFLARE_TOKEN_PERMISSIONS}) are already filled in.`,
      "   Pick your account if asked.",
      '2. Click "Continue to summary", then "Create token".',
      "3. Copy the token and paste it here.",
    ],
    listScopes: (token) => listCloudflareAccounts(token),
    connect: ({ token, scope }) => cloudflare({ accountId: scope, apiToken: token }),
  }),
  vercel: defineCloud({
    label: "Vercel",
    tokenKey: "VERCEL_TOKEN",
    scopeKey: "VERCEL_TEAM_ID",
    scopeLabel: "team",
    tokenUrl: vercelTokenUrl,
    tokenSteps: (tokenName) => [
      "1. A browser tab is opening (link below if it doesn't).",
      `2. Click "Create", name the token ${tokenName}, pick the team`,
      "   to deploy to and an expiration.",
      "3. Copy the token and paste it here.",
    ],
    listScopes: (token) => listVercelTeams(token),
    connect: ({ token, scope }) => vercel({ teamId: scope, token }),
  }),
};

export type CloudName = keyof typeof CLOUDS;
export type ClientOf<C extends CloudName> = ReturnType<(typeof CLOUDS)[C]["connect"]>;
