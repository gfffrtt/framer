import { createHash } from "node:crypto";
import type { EnvVars } from "../dotenv.ts";

const API_URL = "https://api.vercel.com";
const TOKENS_URL = "https://vercel.com/account/settings/tokens";
const UPLOAD_CONCURRENCY = 8;
const DEPLOY_TIMEOUT_MS = 20 * 60 * 1000;

/** Vercel tokens can't be pre-filled from a link, so this is the page the user creates one on. */
export function vercelTokenUrl(): string {
  return TOKENS_URL;
}

/** Lists the teams a token can access (every Vercel account has at least its personal team). */
export async function listVercelTeams(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; name: string }[]> {
  const response = await fetcher(`${API_URL}/v2/teams?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await response.json().catch(() => null)) as { teams?: { id: string; name: string }[] } | null;
  if (!response.ok || !json?.teams) return [];
  return json.teams.map(({ id, name }) => ({ id, name }));
}

export type VercelOptions = {
  teamId: string;
  token: string;
  fetch?: typeof fetch;
  /** Delay between deployment status checks. */
  pollMs?: number;
};

/** A file to deploy: its path relative to the app folder, and its contents. */
export type DeploymentFile = { file: string; data: Uint8Array };

export class VercelError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Deployment = {
  id: string;
  url: string;
  readyState: "BLOCKED" | "BUILDING" | "CANCELED" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY";
  alias?: string[];
  inspectorUrl?: string | null;
};

/** Vercel adapter: projects, their env vars and deployments of local files. */
export function vercel({ teamId, token, fetch: fetcher = fetch, pollMs = 3000 }: VercelOptions) {
  async function request(method: string, path: string, init: { body?: RequestInit["body"]; headers?: Record<string, string> } = {}) {
    const url = new URL(`${API_URL}${path}`);
    url.searchParams.set("teamId", teamId);
    return fetcher(url, {
      method,
      body: init.body,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
  }

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await request(method, path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const json = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!response.ok) {
      const message = json?.error?.message || `HTTP ${response.status}`;
      throw new VercelError(`Vercel ${method} ${path.split("?")[0]} failed: ${message}`, response.status);
    }
    return json as T;
  }

  async function uploadFile({ data }: DeploymentFile, sha: string): Promise<void> {
    const response = await request("POST", "/v2/files", {
      body: data,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "x-vercel-digest": sha,
      },
    });
    if (!response.ok) throw new VercelError(`Vercel file upload failed: HTTP ${response.status}`, response.status);
  }

  return {
    async verify(): Promise<void> {
      try {
        await api("GET", "/v2/user");
      } catch {
        throw new Error("Vercel rejected VERCEL_TOKEN. Check that it is valid and has access to VERCEL_TEAM_ID.");
      }
    },

    /** Returns the project's id, creating it first if it doesn't exist. */
    async ensureProject(name: string): Promise<string> {
      try {
        return (await api<{ id: string }>("GET", `/v9/projects/${encodeURIComponent(name)}`)).id;
      } catch (error) {
        if (!(error instanceof VercelError && error.status === 404)) throw error;
      }
      return (await api<{ id: string }>("POST", "/v11/projects", { name })).id;
    },

    /** Sets (creates or overwrites) env vars on a project, for all of Vercel's targets. */
    async setEnv(projectId: string, vars: EnvVars): Promise<void> {
      const entries = Object.entries(vars);
      if (entries.length === 0) return;
      await api(
        "POST",
        `/v10/projects/${projectId}/env?upsert=true`,
        entries.map(([key, value]) => ({
          key,
          value,
          type: "encrypted",
          target: ["production", "preview", "development"],
        })),
      );
    },

    /**
     * Uploads `files` and deploys them to production, letting Vercel detect the
     * framework. Waits for the build and returns the production URL.
     */
    async deploy(project: { id: string; name: string }, files: DeploymentFile[]): Promise<string> {
      const manifest = files.map((file) => ({
        file: file.file,
        sha: createHash("sha1").update(file.data).digest("hex"),
        size: file.data.byteLength,
      }));

      const queue = files.map((file, index) => [file, manifest[index]!.sha] as const);
      await Promise.all(
        Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) await uploadFile(...next);
        }),
      );

      let deployment = await api<Deployment>("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", {
        name: project.name,
        project: project.id,
        target: "production",
        files: manifest,
      });

      const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
      while (deployment.readyState !== "READY") {
        if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
          const logs = deployment.inspectorUrl ? ` Build logs: ${deployment.inspectorUrl}` : "";
          throw new Error(`Vercel deployment of ${project.name} failed (${deployment.readyState}).${logs}`);
        }
        if (Date.now() > deadline) throw new Error(`Vercel deployment of ${project.name} timed out.`);
        await Bun.sleep(pollMs);
        deployment = await api<Deployment>("GET", `/v13/deployments/${deployment.id}`);
      }

      const aliases = deployment.alias ?? [];
      const host = aliases.find((alias) => alias === `${project.name}.vercel.app`) ?? aliases[0] ?? deployment.url;
      return `https://${host}`;
    },
  };
}

export type Vercel = ReturnType<typeof vercel>;
