import { join } from "node:path";

export type EnvVars = Record<string, string>;

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/;

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    const inner = value.slice(1, -1);
    return value[0] === '"' ? inner.replace(/\\(.)/g, (_, char: string) => (char === "n" ? "\n" : char)) : inner;
  }
  return value;
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_./:@+=-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function parseEnv(text: string): EnvVars {
  const vars: EnvVars = {};
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match) vars[match[1]!] = unquote(match[2] ?? "");
  }
  return vars;
}

export function serializeEnv(vars: EnvVars): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}=${quote(value)}\n`)
    .join("");
}

/** Sets `vars` in an existing env file's text, keeping comments, blank lines and unrelated keys. */
export function mergeEnv(text: string, vars: EnvVars): string {
  const pending = new Map(Object.entries(vars));
  const lines = text === "" ? [] : text.replace(/\n$/, "").split(/\r?\n/);
  const merged = lines.map((line) => {
    const key = LINE.exec(line)?.[1];
    if (key === undefined || !pending.has(key)) return line;
    const value = pending.get(key)!;
    pending.delete(key);
    return `${key}=${quote(value)}`;
  });
  const rest = serializeEnv(Object.fromEntries(pending));
  return [...merged, ...(rest ? [rest.replace(/\n$/, "")] : [])].join("\n") + "\n";
}

/** Reads the root `.env` of a project. Missing file = no vars. */
export async function readRootEnv(root: string): Promise<EnvVars> {
  const file = Bun.file(join(root, ".env"));
  return (await file.exists()) ? parseEnv(await file.text()) : {};
}

export async function updateRootEnv(root: string, vars: EnvVars): Promise<void> {
  const file = Bun.file(join(root, ".env"));
  const text = (await file.exists()) ? await file.text() : "";
  await Bun.write(file, mergeEnv(text, vars));
}
