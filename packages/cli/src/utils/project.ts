import fs from "fs";
import path from "path";
import { CliError } from "../errors";

/** Walk up from `start` to the nearest directory containing a `package.json`. */
export function findProjectRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireProjectRoot(start: string): string {
  const root = findProjectRoot(start);
  if (!root) {
    throw new CliError(
      `No package.json found in ${path.resolve(start)} or any parent directory. Run this command inside a Megh project.`,
    );
  }
  return root;
}

export function readJson<T = any>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function readPackageJson(root: string): Record<string, any> {
  return readJson(path.join(root, "package.json"));
}

/**
 * Find an installed package's directory by walking up `node_modules` folders.
 * Unlike `require.resolve('<pkg>/package.json')` this works for packages whose
 * `exports` map does not expose `package.json`.
 */
export function findInstalledPackage(name: string, from: string): string | null {
  let dir = path.resolve(from);
  for (;;) {
    const candidate = path.join(dir, "node_modules", ...name.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function installedVersion(name: string, from: string): string | null {
  const dir = findInstalledPackage(name, from);
  return dir ? readJson(path.join(dir, "package.json")).version ?? null : null;
}

/** Write a file, creating parent directories. Refuses to overwrite unless `force`. */
export function writeFileSafe(file: string, content: string, force = false): void {
  if (fs.existsSync(file) && !force) {
    throw new CliError(`${file} already exists. Use -f or --force to overwrite it.`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

/** Copy every non-TypeScript file under `srcDir` to the same relative path under `outDir`. */
export function copyAssets(srcDir: string, outDir: string): number {
  if (!fs.existsSync(srcDir)) return 0;
  let copied = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !isAsset(entry.name)) continue;
    const parent = (entry as any).parentPath ?? (entry as any).path;
    const from = path.join(parent, entry.name);
    const to = path.join(outDir, path.relative(srcDir, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied++;
  }
  return copied;
}

export function isAsset(file: string): boolean {
  return !/\.(c|m)?tsx?$/.test(file) && !path.basename(file).startsWith(".");
}
