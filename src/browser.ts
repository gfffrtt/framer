/** Opens `url` in the default browser. Best effort: callers also show the URL. */
export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? ["open", url]
    : process.platform === "win32" ? ["cmd", "/c", "start", "", url]
    : ["xdg-open", url];
  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // The URL is also shown to the user, so they can open it by hand.
  }
}
