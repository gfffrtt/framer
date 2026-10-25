import { expect, test } from "bun:test";
import { decodeGoogleAuth, encodeGoogleAuth, googleDrive } from "./google-drive.ts";

const GOOGLE_AUTH = encodeGoogleAuth({ type: "authorized_user", client_id: "id", client_secret: "s", refresh_token: "r" });

/** A fake Google token endpoint + Drive API backed by an in-memory file list. */
function fakeDrive() {
  const files: { id: string; name: string; parent: string; folder: boolean; content: string }[] = [];
  let refreshes = 0;

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host === "oauth2.googleapis.com") {
      refreshes++;
      return Response.json({ access_token: "at" });
    }
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer at");

    const id = url.pathname.split("/files/")[1];
    if (url.pathname.endsWith("/files") && (init?.method ?? "GET") === "GET") {
      const q = url.searchParams.get("q")!;
      const name = /name = '([^']*)'/.exec(q)![1];
      const parent = /'([^']*)' in parents/.exec(q)![1];
      const folder = q.includes("mimeType = ");
      return Response.json({
        files: files.filter((f) => f.name === name && f.parent === parent && f.folder === folder).map((f) => ({ id: f.id })),
      });
    }
    if (url.pathname.endsWith("/files") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const file = { id: `f${files.length + 1}`, name: body.name, parent: body.parents[0], folder: body.mimeType === "application/vnd.google-apps.folder", content: "" };
      files.push(file);
      return Response.json({ id: file.id });
    }
    const file = files.find((f) => f.id === id);
    if (!file) return Response.json({ error: { message: "not found" } }, { status: 404 });
    if (init?.method === "PATCH") {
      file.content = String(init.body);
      return Response.json({ id: file.id });
    }
    return new Response(file.content);
  }) as typeof fetch;

  return { fetcher, files, refreshes: () => refreshes };
}

test("GOOGLE_AUTH round-trips and is validated", () => {
  expect(decodeGoogleAuth(GOOGLE_AUTH).refresh_token).toBe("r");
  expect(() => decodeGoogleAuth("not json")).toThrow();
  expect(() => decodeGoogleAuth(Buffer.from("{}").toString("base64"))).toThrow("refresh_token");
});

test("creates .framer/<project> once and reuses existing folders", async () => {
  const drive = fakeDrive();
  await googleDrive(GOOGLE_AUTH, drive.fetcher).ensureProject("acme");
  await googleDrive(GOOGLE_AUTH, drive.fetcher).ensureProject("acme");

  expect(drive.files.map(({ name, parent, folder }) => ({ name, parent, folder }))).toEqual([
    { name: ".framer", parent: "root", folder: true },
    { name: "acme", parent: "f1", folder: true },
  ]);
});

test("writes, reads and overwrites env files", async () => {
  const drive = fakeDrive();
  const backend = googleDrive(GOOGLE_AUTH, drive.fetcher);

  expect(await backend.readEnv("acme", "dev")).toEqual({});
  await backend.writeEnv("acme", "dev", { A: "1" });
  await backend.writeEnv("acme", "dev", { A: "2", B: "x y" });
  expect(await backend.readEnv("acme", "dev")).toEqual({ A: "2", B: "x y" });

  expect(drive.files.filter((f) => !f.folder).map((f) => f.name)).toEqual(["dev.env"]);
  expect(drive.refreshes()).toBe(1);
});
