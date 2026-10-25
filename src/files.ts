import { readdir } from "node:fs/promises";

/** True when `dir` is missing or has no files. */
export async function isEmptyDir(dir: string): Promise<boolean> {
  return (await readdir(dir).catch(() => [])).length === 0;
}

/** How framer writes JSON files: 2-space indent, trailing newline. */
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
