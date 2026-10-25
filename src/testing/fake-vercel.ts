import { expect } from "bun:test";

/**
 * A fake Vercel API for team `team`. Deployments finish after `polls` status
 * checks; `fail` makes them end in ERROR.
 */
export function fakeVercel(options: { fail?: boolean; polls?: number } = {}) {
  const { polls = 0 } = options;
  const projects: string[] = ["acme-web-prod"];
  const created: string[] = [];
  const env: Record<string, { key: string; value: string; target: string[] }[]> = {};
  const uploads: Record<string, string> = {};
  const deployments: { project: string; files: { file: string; sha: string; size: number }[]; polls: number }[] = [];

  function state(index: number) {
    const deployment = deployments[index]!;
    const id = `dpl-${index}`;
    if (deployment.polls < polls) return { id, url: "x.vercel.app", readyState: "BUILDING" };
    if (options.fail) return { id, url: "x", readyState: "ERROR", inspectorUrl: "https://vercel.com/logs" };
    return {
      id,
      url: `${deployment.project}-abc123.vercel.app`,
      readyState: "READY",
      alias: [`${deployment.project}-team.vercel.app`, `${deployment.project}.vercel.app`],
    };
  }

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("teamId")).toBe("team");
    const path = url.pathname;
    const method = init?.method ?? "GET";

    if (path === "/v2/user") return Response.json({ user: { id: "u" } });
    if (path.startsWith("/v9/projects/")) {
      const name = decodeURIComponent(path.split("/")[3]!);
      return projects.includes(name) ?
          Response.json({ id: `prj-${name}` })
        : Response.json({ error: { message: "not found" } }, { status: 404 });
    }
    if (path === "/v11/projects" && method === "POST") {
      const { name } = JSON.parse(String(init!.body));
      projects.push(name);
      created.push(name);
      return Response.json({ id: `prj-${name}`, name });
    }
    if (path.endsWith("/env") && method === "POST") {
      expect(url.searchParams.get("upsert")).toBe("true");
      env[path.split("/")[3]!] = JSON.parse(String(init!.body));
      return Response.json({ created: [], failed: [] }, { status: 201 });
    }
    if (path === "/v2/files") {
      const headers = new Headers(init!.headers);
      uploads[headers.get("x-vercel-digest")!] = Buffer.from(init!.body as Uint8Array).toString();
      return Response.json({});
    }
    if (path === "/v13/deployments" && method === "POST") {
      expect(url.searchParams.get("skipAutoDetectionConfirmation")).toBe("1");
      const body = JSON.parse(String(init!.body));
      expect(body.target).toBe("production");
      deployments.push({ project: body.name, files: body.files, polls: 0 });
      return Response.json(state(deployments.length - 1));
    }
    if (path.startsWith("/v13/deployments/")) {
      const index = Number(path.split("-").at(-1));
      deployments[index]!.polls++;
      return Response.json(state(index));
    }
    return Response.json({ error: { message: "unexpected" } }, { status: 500 });
  }) as typeof globalThis.fetch;

  return { fetch, created, env, uploads, deployments };
}
