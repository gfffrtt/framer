/** What every cloud's API client can do: check that its credentials work. */
export type CloudClient = { verify(): Promise<void> };

/** What framer needs from every cloud: a token, and the account/team it acts on. */
export type CloudCredentials = { token: string; scope: string };

/**
 * A cloud framer can provision on. Describes how the add flow gets its credentials
 * (ADR 0024) and how to build its API client from them.
 */
export type Cloud<Client extends CloudClient = CloudClient> = {
  /** How entity configs and `--cloud` name it: `cloudflare`. */
  name: string;
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
  connect(credentials: CloudCredentials, fetch?: typeof globalThis.fetch): Client;
};
