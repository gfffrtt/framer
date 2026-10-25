import { createHash } from "node:crypto";
import type { Cloud } from "./index.ts";

const API_URL = "https://api.cloudflare.com/client/v4";
const R2_WRITE_PERMISSION = "Workers R2 Storage Bucket Item Write";
const PAGE_SIZE = 50;

export const CLOUDFLARE_TOKEN_PERMISSIONS = "Account API Tokens: Edit and Workers R2 Storage: Edit";

/**
 * The dashboard's "create account API token" page with the permissions framer needs
 * and the token's name already filled in (Cloudflare "token template" URL).
 */
export function cloudflareTokenUrl(tokenName: string): string {
  return (
    "https://dash.cloudflare.com/?to=/:account/api-tokens&" +
    new URLSearchParams({
      permissionGroupKeys: JSON.stringify([
        { key: "workers_r2", type: "edit" },
        { key: "account_api_tokens", type: "edit" },
      ]),
      name: tokenName,
    })
  );
}

/** Lists the accounts an API token can access, so the user doesn't have to look up the account ID. */
export async function listCloudflareAccounts(
  apiToken: string,
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; name: string }[]> {
  const response = await fetcher(`${API_URL}/accounts?per_page=50`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const json = (await response.json().catch(() => null)) as ApiResponse<{ id: string; name: string }[]> | null;
  if (!response.ok || !json?.success) return [];
  return json.result.map(({ id, name }) => ({ id, name }));
}

export type CloudflareOptions = {
  accountId: string;
  apiToken: string;
  fetch?: typeof fetch;
};

export type R2Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

type ApiResponse<T> = {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
};

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Cloudflare adapter: provisions R2 buckets and bucket-scoped S3 credentials. */
export function cloudflare({ accountId, apiToken, fetch: fetcher = fetch }: CloudflareOptions) {
  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetcher(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!response.ok || !json?.success) {
      const message = json?.errors?.map((error) => error.message).join(", ") || `HTTP ${response.status}`;
      throw new CloudflareError(`Cloudflare ${method} ${path} failed: ${message}`, response.status);
    }
    return json.result;
  }

  /** Account-owned and user-owned tokens live under different API paths; the first that verifies wins. */
  let tokensPath: Promise<string> | undefined;
  function tokens(): Promise<string> {
    tokensPath ??= (async () => {
      for (const path of [`/accounts/${accountId}/tokens`, "/user/tokens"]) {
        try {
          await api("GET", `${path}/verify`);
          return path;
        } catch {
          // Try the other kind of token.
        }
      }
      throw new Error(`Cloudflare rejected the token. It needs: ${CLOUDFLARE_TOKEN_PERMISSIONS}.`);
    })();
    return tokensPath;
  }

  async function tokensNamed(path: string, name: string): Promise<{ id: string }[]> {
    const found: { id: string }[] = [];
    for (let page = 1; ; page++) {
      const batch = await api<{ id: string; name: string }[]>("GET", `${path}?page=${page}&per_page=${PAGE_SIZE}`);
      found.push(...batch.filter((token) => token.name === name));
      if (batch.length < PAGE_SIZE) return found;
    }
  }

  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,

    async verify(): Promise<void> {
      await tokens();
    },

    /** Creates an R2 bucket. A bucket that already exists in the account counts as success. */
    async ensureR2Bucket(name: string): Promise<void> {
      try {
        await api("POST", `/accounts/${accountId}/r2/buckets`, { name });
      } catch (error) {
        if (error instanceof CloudflareError && error.status === 409) return;
        throw error;
      }
    },

    /**
     * Creates an API token named `tokenName` that can only read/write objects in
     * `bucket`, and turns it into S3 credentials: access key id = token id,
     * secret = sha256(token value). Tokens already named `tokenName` (left by an
     * earlier run) are deleted first, so re-running never leaves a live orphan.
     */
    async replaceR2Credentials(bucket: string, tokenName: string): Promise<R2Credentials> {
      const path = await tokens();
      const groups = await api<{ id: string; name: string }[]>("GET", `${path}/permission_groups`);
      const group = groups.find((candidate) => candidate.name === R2_WRITE_PERMISSION);
      if (!group) throw new Error(`Cloudflare permission group "${R2_WRITE_PERMISSION}" not found.`);

      for (const { id } of await tokensNamed(path, tokenName)) await api("DELETE", `${path}/${id}`);

      const token = await api<{ id: string; value: string }>("POST", path, {
        name: tokenName,
        policies: [
          {
            effect: "allow",
            resources: { [`com.cloudflare.edge.r2.bucket.${accountId}_default_${bucket}`]: "*" },
            permission_groups: [{ id: group.id }],
          },
        ],
      });

      return {
        accessKeyId: token.id,
        secretAccessKey: createHash("sha256").update(token.value).digest("hex"),
      };
    },
  };
}

export type Cloudflare = ReturnType<typeof cloudflare>;

export const CLOUDFLARE: Cloud<Cloudflare> = {
  name: "cloudflare",
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
  connect: ({ token, scope }, fetch) => cloudflare({ accountId: scope, apiToken: token, fetch }),
};
