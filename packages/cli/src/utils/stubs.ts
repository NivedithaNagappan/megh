import fs from "fs";
import path from "path";

/**
 * The package root (the directory holding `stubs/` and `package.json`). Source
 * files run from `src/**` under Vitest and from `dist/**` once built, so walk
 * up from this file instead of assuming a fixed depth.
 */
export const packageRoot: string = (() => {
  let dir = __dirname;
  for (;;) {
    if (
      fs.existsSync(path.join(dir, "stubs")) &&
      fs.existsSync(path.join(dir, "package.json"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(__dirname, "..", "..");
    dir = parent;
  }
})();

export function stubPath(name: string): string {
  return path.join(packageRoot, "stubs", ...name.split("/"));
}

/**
 * Read a stub and replace `{Key}` placeholders. Unknown placeholders are left
 * untouched so object literals in stubs are safe.
 */
export function renderStub(name: string, vars: Record<string, string> = {}): string {
  let content = fs.readFileSync(stubPath(name), "utf8").replace(/\r\n/g, "\n");
  for (const [key, value] of Object.entries(vars)) {
    content = content.split(`{${key}}`).join(value);
  }
  return content;
}

export function cliVersion(): string {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version;
}

/** The `@meghjs/core` range new projects should depend on (lockstep with the CLI). */
export function coreRange(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  return pkg.peerDependencies?.["@meghjs/core"] ?? `^${pkg.version}`;
}
