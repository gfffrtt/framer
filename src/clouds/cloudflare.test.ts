import { expect, test } from "bun:test";
import { cloudflare, listCloudflareAccounts } from "./cloudflare.ts";
import { fakeCloudflare } from "../testing/fake-cloudflare.ts";

test("lists the accounts a Cloudflare token can access", async () => {
  const fetcher = (async () =>
    Response.json({ success: true, errors: [], result: [{ id: "acc", name: "Acme", extra: 1 }] })) as unknown as typeof fetch;
  expect(await listCloudflareAccounts("t", fetcher)).toEqual([{ id: "acc", name: "Acme" }]);

  const failing = (async () => Response.json({ success: false, errors: [] }, { status: 403 })) as unknown as typeof fetch;
  expect(await listCloudflareAccounts("t", failing)).toEqual([]);
});

test("re-creating R2 credentials replaces the token left by an earlier run", async () => {
  const cf = fakeCloudflare();
  const client = cloudflare({ accountId: "acc", apiToken: "t", fetch: cf.fetch });
  await client.replaceR2Credentials("acme-other-dev", "framer-buckets-acme-other-dev");
  await client.replaceR2Credentials("acme-uploads-dev", "framer-buckets-acme-uploads-dev");
  const second = await client.replaceR2Credentials("acme-uploads-dev", "framer-buckets-acme-uploads-dev");

  expect(second.accessKeyId).toBe("key-3");
  expect(cf.tokens.map(({ id, name }) => [id, name])).toEqual([
    ["key-1", "framer-buckets-acme-other-dev"],
    ["key-3", "framer-buckets-acme-uploads-dev"],
  ]);
});
