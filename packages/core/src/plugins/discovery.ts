import fs from "fs";
import path from "path";
import { assertPlugin, type MeghPlugin } from "./plugin";

/**
 * Find the plugins among the app's installed dependencies.
 *
 * A package is a plugin when its package.json has
 * `"megh": { "plugin": "./dist/plugin.js" }`. The entry's default export
 * (or `plugin` export, or the module itself) must be an `MeghPlugin`.
 * Dependencies listed in the app's package.json but not installed, such as
 * dev dependencies in a production install, are skipped.
 */
export function discoverPlugins(root: string = process.cwd()): MeghPlugin[] {
  const appPkg = readJson(path.join(root, "package.json"));
  if (!appPkg) return [];

  const names = Object.keys({
    ...appPkg.dependencies,
    ...appPkg.devDependencies,
  }).sort();
  const plugins: MeghPlugin[] = [];
  for (const name of names) {
    const dir = findPackageDir(name, root);
    if (!dir) continue;
    const entry = readJson(path.join(dir, "package.json"))?.megh?.plugin;
    if (typeof entry !== "string") continue;

    const mod = require(path.join(dir, entry));
    const plugin = mod?.default ?? mod?.plugin ?? mod;
    assertPlugin(plugin, `${name} (${entry})`);
    plugins.push(plugin);
  }
  return plugins;
}

/** Look for `node_modules/<name>` from `from` up to the filesystem root, as Node does. */
function findPackageDir(name: string, from: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
