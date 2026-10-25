import { createHash } from "node:crypto";

const API_URL = "https://api.cloudflare.com/client/v4";
const R2_WRITE_PERMISSION = "Workers R2 Storage Bucket Item Write";

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
  /** Account-owned and user-owned tokens live under different API paths; `verify` picks one. */
  let tokensPath: string | undefined;

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

  async function verify(): Promise<void> {
    if (tokensPath) return;
    for (const path of [`/accounts/${accountId}/tokens`, "/user/tokens"]) {
      try {
        await api("GET", `${path}/verify`);
        tokensPath = path;
        return;
      } catch {
        // Try the other kind of token.
      }
    }
    throw new Error(`Cloudflare rejected CLOUDFLARE_API_TOKEN. It needs: ${CLOUDFLARE_TOKEN_PERMISSIONS}.`);
  }

  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,

    verify,

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
     * Creates an API token that can only read/write objects in `bucket`, and turns it
     * into S3 credentials: access key id = token id, secret = sha256(token value).
     */
    async createR2Credentials(bucket: string): Promise<R2Credentials> {
      await verify();
      const groups = await api<{ id: string; name: string }[]>("GET", `${tokensPath}/permission_groups`);
      const group = groups.find((candidate) => candidate.name === R2_WRITE_PERMISSION);
      if (!group) throw new Error(`Cloudflare permission group "${R2_WRITE_PERMISSION}" not found.`);

      const token = await api<{ id: string; value: string }>("POST", tokensPath!, {
        name: `framer-buckets-${bucket}`,
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
