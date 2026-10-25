import { expect } from "bun:test";

/**
 * A fake Cloudflare API for account `acc`. `fail` makes bucket creation fail,
 * `reject` makes every token verification fail.
 */
export function fakeCloudflare(options: { fail?: boolean; reject?: boolean } = {}) {
  const buckets: string[] = [];
  const tokens: { id: string; name: string; resources: string[]; token: string }[] = [];
  let created = 0;
  const ok = (result: unknown, status = 200) =>
    Response.json({ success: status < 400, errors: status < 400 ? [] : [{ code: 1, message: "nope" }], result }, { status });

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/client/v4", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const token = new Headers(init?.headers).get("Authorization")!.replace("Bearer ", "");

    if (path === "/accounts/acc/tokens/verify") return options.reject ? ok(null, 401) : ok({ status: "active" });
    if (path === "/accounts/acc/r2/buckets" && method === "POST") {
      if (options.fail) return ok(null, 500);
      if (buckets.includes(body.name)) return ok(null, 409);
      buckets.push(body.name);
      return ok({ name: body.name });
    }
    if (path === "/accounts/acc/tokens/permission_groups") {
      return ok([
        { id: "pg-read", name: "Workers R2 Storage Bucket Item Read" },
        { id: "pg-write", name: "Workers R2 Storage Bucket Item Write" },
      ]);
    }
    if (path === "/accounts/acc/tokens" && method === "GET") {
      const page = Number(url.searchParams.get("page"));
      const perPage = Number(url.searchParams.get("per_page"));
      return ok(tokens.slice((page - 1) * perPage, page * perPage).map(({ id, name }) => ({ id, name })));
    }
    if (path.startsWith("/accounts/acc/tokens/") && method === "DELETE") {
      const index = tokens.findIndex((candidate) => candidate.id === path.split("/").at(-1));
      if (index === -1) return ok(null, 404);
      tokens.splice(index, 1);
      return ok({ id: path.split("/").at(-1) });
    }
    if (path === "/accounts/acc/tokens" && method === "POST") {
      expect(body.policies[0].permission_groups).toEqual([{ id: "pg-write" }]);
      created++;
      tokens.push({ id: `key-${created}`, name: body.name, resources: Object.keys(body.policies[0].resources), token });
      return ok({ id: `key-${created}`, value: `secret-${created}` });
    }
    return ok(null, 404);
  }) as typeof globalThis.fetch;

  return { fetch, buckets, tokens };
}
