import fs from "fs";
import path from "path";
import { readTsConfig, findTsConfig } from "./tsconfig";

export type ProjectLayout = {
  root: string;
  srcDir: string;
  outDir: string;
  compilerOptions: Record<string, any>;
  tsconfig: string | null;
};

export function projectLayout(root: string, preferBuildConfig = false): ProjectLayout {
  const tsconfig = findTsConfig(root, preferBuildConfig);
  const compilerOptions = tsconfig ? readTsConfig(tsconfig).compilerOptions : {};
  return {
    root,
    tsconfig,
    compilerOptions,
    srcDir: compilerOptions.rootDir ?? path.join(root, "src"),
    outDir: compilerOptions.outDir ?? path.join(root, "dist"),
  };
}

const DEFAULT_ENTRIES = ["serve.js", "server.js", "main.js", "index.js"];

/**
 * Candidate entry files, most specific first: `--entry`, `megh.entry` in
 * package.json, `main` (mapped from `src/*.ts` to the output dir), then the
 * conventional names in the output dir.
 */
export function entryCandidates(
  layout: ProjectLayout,
  pkg: Record<string, any>,
  explicit?: string,
): string[] {
  const list: string[] = [];
  const add = (p: string) => list.push(path.resolve(layout.root, p));
  if (explicit) add(explicit);
  if (typeof pkg?.megh?.entry === "string") add(pkg.megh.entry);
  if (typeof pkg?.main === "string") {
    const main = path.resolve(layout.root, pkg.main);
    const rel = path.relative(layout.srcDir, main);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      add(path.join(layout.outDir, rel).replace(/\.ts$/, ".js"));
    } else {
      add(main);
    }
  }
  for (const name of DEFAULT_ENTRIES) add(path.join(layout.outDir, name));
  return [...new Set(list)];
}

export function resolveEntry(candidates: string[], explicit?: string): string | null {
  // An explicit --entry must exist itself; no silent fallback.
  if (explicit) return fs.existsSync(candidates[0]) ? candidates[0] : null;
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}
