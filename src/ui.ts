// framer's CLI is black and white. Clack colors its output (cyan, green, yellow…),
// so we strip foreground/background color codes from everything written to the
// terminal and keep only bold, dim and inverse.

// SGR codes for colors: 30–39, 40–49, 90–97, 100–107, plus 38;5;n / 38;2;r;g;b forms.
const COLOR_SGR = /\x1b\[(?:3[0-9]|4[0-9]|9[0-7]|10[0-7])(?:;5;\d+|;2;\d+;\d+;\d+)?m/g;

function stripColors(chunk: unknown): unknown {
  if (typeof chunk === "string") return chunk.replace(COLOR_SGR, "");
  if (chunk instanceof Uint8Array) {
    return Buffer.from(Buffer.from(chunk).toString("utf8").replace(COLOR_SGR, ""), "utf8");
  }
  return chunk;
}

export function monochrome(): void {
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream) as (...args: unknown[]) => boolean;
    stream.write = ((chunk: unknown, ...rest: unknown[]) =>
      write(stripColors(chunk), ...rest)) as typeof stream.write;
  }
}
