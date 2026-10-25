import { expect, test } from "bun:test";
import { mergeEnv, parseEnv, serializeEnv } from "./dotenv.ts";

test("parses keys, quotes, export and comments", () => {
  const text = ['# comment', 'A=1', 'export B="two words"', "C='x=y'", "", "D="].join("\n");
  expect(parseEnv(text)).toEqual({ A: "1", B: "two words", C: "x=y", D: "" });
});

test("serialize/parse round-trips", () => {
  const vars = { A: "plain", B: "with space", C: 'quote " and \\ slash', D: "line\nbreak", E: "abc==" };
  expect(parseEnv(serializeEnv(vars))).toEqual(vars);
});

test("merge keeps comments and unrelated keys, updates and appends", () => {
  const text = "# keep me\nA=1\nB=2\n";
  expect(mergeEnv(text, { B: "3", C: "4" })).toBe("# keep me\nA=1\nB=3\nC=4\n");
  expect(mergeEnv("", { A: "1" })).toBe("A=1\n");
});
