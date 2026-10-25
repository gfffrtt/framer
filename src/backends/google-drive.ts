import { createHash, randomBytes } from "node:crypto";
import type { Backend, BackendAdapter } from "./index.ts";
import { openBrowser } from "../browser.ts";
import { parseEnv, serializeEnv } from "../dotenv.ts";

// framer's own OAuth "Desktop app" client. Google treats desktop client secrets as
// non-confidential, so they can ship inside the binary.
// `bun run build` inlines them from the repo's `.env` (`--env=FRAMER_CLIENT_*`), so they
// stay out of git; `bun src/index.ts` reads them from the environment.
const CLIENT_ID = process.env.FRAMER_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.FRAMER_CLIENT_SECRET ?? "";

/** Only gives access to files framer itself created. */
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** The folder in the user's Drive that holds every framer project. */
export const ROOT_FOLDER = ".framer";

/** The JSON behind `GOOGLE_AUTH` (base64-encoded), same shape as gcloud's "authorized_user". */
export type GoogleAuth = {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
};

export function encodeGoogleAuth(auth: GoogleAuth): string {
  return Buffer.from(JSON.stringify(auth)).toString("base64");
}

export function decodeGoogleAuth(value: string): GoogleAuth {
  let auth: Partial<GoogleAuth>;
  try {
    auth = JSON.parse(Buffer.from(value.trim(), "base64").toString("utf8"));
  } catch {
    throw new Error("GOOGLE_AUTH is not valid base64-encoded JSON.");
  }
  if (!auth.client_id || !auth.client_secret || !auth.refresh_token) {
    throw new Error("GOOGLE_AUTH must contain client_id, client_secret and refresh_token.");
  }
  return { type: "authorized_user", ...auth } as GoogleAuth;
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

/**
 * Logs in with Google in the browser (loopback redirect + PKCE) and returns the
 * base64 `GOOGLE_AUTH` value. `onUrl` receives the consent URL to show to the user.
 */
export async function login(onUrl: (url: string) => void): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "framer's Google OAuth client is not configured. Set FRAMER_CLIENT_ID and FRAMER_CLIENT_SECRET, or provide GOOGLE_AUTH.",
    );
  }

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const { promise: code, resolve, reject } = Promise.withResolvers<string>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const params = new URL(request.url).searchParams;
      if (!params.has("code") && !params.has("error")) return new Response("Not found", { status: 404 });
      if (params.get("state") !== state) {
        reject(new Error("Google login failed: state mismatch."));
      } else if (params.get("error")) {
        reject(new Error(`Google login failed: ${params.get("error")}.`));
      } else {
        resolve(params.get("code")!);
      }
      return new Response("framer: you can close this tab and go back to the terminal.");
    },
  });
  const redirectUri = `http://127.0.0.1:${server.port}`;

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  onUrl(url.toString());
  openBrowser(url.toString());

  const timeout = setTimeout(() => reject(new Error("Google login timed out.")), LOGIN_TIMEOUT_MS);
  try {
    const tokens = await postForm(fetch, TOKEN_URL, {
      code: await code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token.");
    return encodeGoogleAuth({
      type: "authorized_user",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    });
  } finally {
    clearTimeout(timeout);
    server.stop(true);
  }
}

async function postForm(fetcher: typeof fetch, url: string, body: Record<string, string>) {
  const response = await fetcher(url, { method: "POST", body: new URLSearchParams(body) });
  const json = (await response.json().catch(() => ({}))) as Record<string, string>;
  if (!response.ok) {
    throw new Error(`Google auth failed: ${json.error_description ?? json.error ?? response.status}`);
  }
  return json;
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * A backend that stores env files in the user's Google Drive: `.framer/<project>/<env>.env`
 * for generated envs, `.framer/<project>/<entity>/<env>.env` for an entity's custom envs.
 */
export function googleDrive(googleAuth: string, fetcher: typeof fetch = fetch): Backend {
  const auth = decodeGoogleAuth(googleAuth);
  let accessToken: Promise<string> | undefined;

  function token(): Promise<string> {
    accessToken ??= postForm(fetcher, TOKEN_URL, {
      client_id: auth.client_id,
      client_secret: auth.client_secret,
      refresh_token: auth.refresh_token,
      grant_type: "refresh_token",
    }).then((json) => json.access_token!);
    return accessToken;
  }

  async function drive(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await token()}`);
    const response = await fetcher(url, { ...init, headers });
    if (!response.ok) {
      const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Google Drive request failed: ${json.error?.message ?? response.status}`);
    }
    return response;
  }

  async function find(name: string, parent: string, folder: boolean): Promise<string | undefined> {
    const q = [
      `name = '${escapeQuery(name)}'`,
      `'${escapeQuery(parent)}' in parents`,
      `mimeType ${folder ? "=" : "!="} '${FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and ");
    const url = `${DRIVE_URL}?${new URLSearchParams({ q, fields: "files(id)", spaces: "drive" })}`;
    const { files } = (await (await drive(url)).json()) as { files: { id: string }[] };
    return files[0]?.id;
  }

  async function create(name: string, parent: string, mimeType?: string): Promise<string> {
    const response = await drive(`${DRIVE_URL}?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [parent], ...(mimeType ? { mimeType } : {}) }),
    });
    return ((await response.json()) as { id: string }).id;
  }

  async function folder(name: string, parent: string): Promise<string> {
    return (await find(name, parent, true)) ?? (await create(name, parent, FOLDER_MIME));
  }

  // Cached so concurrent calls don't create duplicate folders.
  const folders = new Map<string, Promise<string>>();
  /** The folder at `path` (e.g. `.framer/acme/apps/web`), created if missing. */
  function folderAt(path: string): Promise<string> {
    let id = folders.get(path);
    if (!id) {
      const slash = path.lastIndexOf("/");
      const parent = slash === -1 ? Promise.resolve("root") : folderAt(path.slice(0, slash));
      id = parent.then((parentId) => folder(path.slice(slash + 1), parentId));
      folders.set(path, id);
    }
    return id;
  }

  function envFolder(project: string, entity?: string): Promise<string> {
    return folderAt(folderPath(project, entity));
  }

  return {
    async ensureProject(project) {
      await envFolder(project);
    },

    async readEnv(project, env, entity) {
      const id = await find(`${env}.env`, await envFolder(project, entity), false);
      if (!id) return {};
      return parseEnv(await (await drive(`${DRIVE_URL}/${id}?alt=media`)).text());
    },

    async writeEnv(project, env, vars, entity) {
      const parent = await envFolder(project, entity);
      const name = `${env}.env`;
      const id = (await find(name, parent, false)) ?? (await create(name, parent, "text/plain"));
      await drive(`${UPLOAD_URL}/${id}?uploadType=media`, {
        method: "PATCH",
        headers: { "Content-Type": "text/plain" },
        body: serializeEnv(vars),
      });
    },

    location(project, env, entity) {
      return env === undefined ? folderPath(project, entity) : `${folderPath(project, entity)}/${env}.env`;
    },
  };
}

/** `.framer/acme`, or `.framer/acme/apps/web` for an entity's custom envs. */
function folderPath(project: string, entity?: string): string {
  return [ROOT_FOLDER, project, entity].filter(Boolean).join("/");
}

export const GOOGLE_DRIVE: BackendAdapter = {
  label: "Google Drive",
  credentialKey: "GOOGLE_AUTH",
  credentialHint: "base64 authorized_user JSON",
  loginLabel: "Log in with Google",
  login,
  connect: (credential) => googleDrive(credential),
};
