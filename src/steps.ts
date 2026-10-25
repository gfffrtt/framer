/** One unit of work a command plans. The CLI runs steps behind a spinner; tests run them directly. */
export type Step = {
  /** Shown while the step runs. */
  title: string;
  /** Shown once the step is done. */
  done: string;
  run: () => Promise<void>;
};

export async function runSteps(steps: Step[]): Promise<void> {
  for (const step of steps) await step.run();
}
