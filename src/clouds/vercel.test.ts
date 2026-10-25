import { expect, test } from "bun:test";
import { listVercelTeams, vercel } from "./vercel.ts";
import { fakeVercel } from "../testing/fake-vercel.ts";

const file = { file: "index.html", data: new TextEncoder().encode("<h1>hi</h1>") };

test("lists the teams a Vercel token can access", async () => {
  const fetcher = (async () => Response.json({ teams: [{ id: "team", name: "Acme", slug: "acme" }] })) as unknown as typeof fetch;
  expect(await listVercelTeams("t", fetcher)).toEqual([{ id: "team", name: "Acme" }]);
});

test("waits for the deployment and returns its production URL", async () => {
  const fake = fakeVercel({ polls: 2 });
  const client = vercel({ teamId: "team", token: "t", fetch: fake.fetch, pollMs: 0 });
  expect(await client.deploy({ id: "prj", name: "acme-web-dev" }, [file])).toBe("https://acme-web-dev.vercel.app");
  expect(fake.deployments[0]!.polls).toBe(2);
});

test("a failed deployment links to its build logs", async () => {
  const fake = fakeVercel({ fail: true, polls: 1 });
  const client = vercel({ teamId: "team", token: "t", fetch: fake.fetch, pollMs: 0 });
  await expect(client.deploy({ id: "prj", name: "acme-web-dev" }, [file])).rejects.toThrow("Build logs: https://vercel.com/logs");
});
