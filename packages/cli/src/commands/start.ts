import { spawn } from "child_process";
import path from "path";
import { CliError } from "../errors";
import { entryCandidates, projectLayout, resolveEntry } from "../utils/entry";
import { log } from "../utils/log";
import { readPackageJson, requireProjectRoot } from "../utils/project";

export type StartOptions = { cwd?: string; entry?: string };

/**
 * Run the compiled app from the output dir in production mode
 * (`NODE_ENV=production` unless already set). Resolves to the app's exit code.
 * SIGINT/SIGTERM are forwarded so the app can shut down gracefully.
 */
export async function start(opts: StartOptions = {}): Promise<number> {
  const root = requireProjectRoot(opts.cwd ?? process.cwd());
  const layout = projectLayout(root, true);
  const candidates = entryCandidates(layout, readPackageJson(root), opts.entry);
  const entry = resolveEntry(candidates, opts.entry);
  if (!entry) {
    throw new CliError(
      `No compiled entry file found (tried ${candidates.map((p) => path.relative(root, p)).join(", ")}). ` +
        "Run `megh build` first, or pass --entry.",
    );
  }
  const env = { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "production" };
  log.info(`Starting ${path.relative(root, entry)} (NODE_ENV=${env.NODE_ENV})`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--enable-source-maps", entry], { cwd: root, env, stdio: "inherit" });
    const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
    const onInt = forward("SIGINT");
    const onTerm = forward("SIGTERM");
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      resolve(code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1));
    });
  });
}
