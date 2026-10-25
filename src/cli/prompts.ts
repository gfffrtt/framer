import { styleText } from "node:util";
import * as p from "@clack/prompts";
import type { Step } from "../steps.ts";

export const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Exits cleanly when the user presses Ctrl+C / Esc on a prompt. */
export function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

export function intro(command: string): void {
  p.intro(`${styleText("inverse", " framer ")} ${command}`);
}

/** Shows an answer framer didn't have to ask for: a flag, the environment, a default. */
export function given(label: string, value: string): void {
  p.log.step(`${label}\n${styleText("dim", value)}`);
}

/** Prints a URL on its own line, outside clack's frame, so copying it doesn't pick up the `│` bars. */
export function printUrl(url: string): void {
  process.stdout.write(`\n${url}\n\n`);
}

export function required(input: string | undefined): string | undefined {
  return input?.trim() ? undefined : "Required.";
}

export type TextQuestion = {
  label: string;
  /** The answer from an argument or flag. framer only asks when it's missing. */
  value: string | undefined;
  /** Dim text after the label in the prompt. */
  hint?: string;
  placeholder?: string;
  /** Used when the user enters nothing, and as is without a terminal. */
  default?: string;
  /** The error without a terminal and without a default. */
  required?: string;
  validate?: (value: string) => string | null;
};

/** An argument or flag wins; otherwise framer asks; without a terminal it uses the default or fails. */
export async function ask(question: TextQuestion): Promise<string> {
  const { label, value, validate } = question;
  if (value !== undefined || !interactive) {
    const resolved = value ?? question.default;
    if (resolved === undefined) throw new Error(question.required ?? `${label} is required.`);
    const error = validate?.(resolved);
    if (error) throw new Error(error);
    given(label, resolved);
    return resolved;
  }
  const input = answer(
    await p.text({
      message: question.hint ? `${label} ${styleText("dim", question.hint)}` : label,
      placeholder: question.placeholder ?? question.default,
      defaultValue: question.default,
      validate: (input) => {
        const trimmed = input?.trim() ?? "";
        if (!trimmed) return question.default === undefined ? "Required." : undefined;
        return validate?.(trimmed) ?? undefined;
      },
    }),
  );
  return input.trim() || (question.default ?? "");
}

/** One option of `choose`. `key` is what a flag names it by. */
export type Choice<T> = { key: string; label: string; value: T };

/** The option a flag names, or an error listing the available ones. */
export function option<T>(options: Choice<T>[], key: string, unknown: (key: string) => string): Choice<T> {
  const found = options.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`${unknown(key)} Available: ${options.map((candidate) => candidate.key).join(", ")}.`);
  return found;
}

/** `preset` (from a flag, see `option`) wins; otherwise framer asks; without a terminal it picks the first option. */
export async function choose<T>(label: string, options: Choice<T>[], preset?: Choice<T>): Promise<T> {
  if (preset || !interactive) {
    const choice = preset ?? options[0]!;
    given(label, choice.label);
    return choice.value;
  }
  const key = answer(await p.select({ message: label, options: options.map(({ key, label }) => ({ value: key, label })) }));
  return option(options, key, (key) => `Unknown option "${key}".`).value;
}

/** Runs a command's steps behind a spinner that shows each step's title, then its `done` text. */
export async function runWithSpinner(steps: Step[]): Promise<void> {
  const spinner = p.spinner();
  for (const step of steps) {
    spinner.start(step.title);
    try {
      await step.run();
    } catch (error) {
      spinner.error(step.title);
      throw error;
    }
    spinner.stop(step.done);
  }
}
