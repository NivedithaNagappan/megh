import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { SwcCompiler } from "../compiler";
import { CliError } from "../errors";
import { projectLayout } from "../utils/entry";
import { c, log } from "../utils/log";
import { readPackageJson, requireProjectRoot } from "../utils/project";

/** Where apps used to export their own Kysely instance. Still used when present. */
export const LEGACY_CONNECTION = "src/database/connection.ts";
export const DEFAULT_MIGRATIONS = "src/database/migrations";

export type DatabasePaths = {
  /**
   * A module exporting the app's own Kysely instance (`default` or `db`),
   * from before `useMeghORM`. `null` when the connection comes from settings.
   */
  connection: string | null;
  /**
   * Connection settings from `megh.database` in package.json, merged over
   * the environment (DATABASE_URL, DB_*) the way `app.useMeghORM()` does.
   */
  settings: Record<string, unknown>;
  /** Folder of migration files. */
  migrations: string;
};

/** `megh.database` / `megh.migrations` from package.json, else the defaults. */
export function databasePaths(root: string, pkg: Record<string, any> = readPackageJson(root)): DatabasePaths {
  const conf = pkg?.megh ?? {};
  const legacy = path.resolve(root, LEGACY_CONNECTION);
  let connection: string | null = null;
  if (typeof conf.database === "string") connection = path.resolve(root, conf.database);
  else if (!conf.database && fs.existsSync(legacy)) connection = legacy;
  return {
    connection,
    settings: conf.database && typeof conf.database === "object" ? conf.database : {},
    migrations: path.resolve(root, typeof conf.migrations === "string" ? conf.migrations : DEFAULT_MIGRATIONS),
  };
}

export type MigrateAction = "latest" | "rollback" | "reset" | "refresh" | "status";
export type MigrateOptions = { cwd?: string; step?: number };

const MARKER = "__MEGH_MIGRATE__";

/**
 * Runs in a child process: loads `.env` and @meghjs/core from the project,
 * connects from the settings (or loads a legacy connection module), runs
 * the action, prints the result as JSON after MARKER and closes the
 * connection.
 */
const WORKER = `
const fs = require("fs");
const path = require("path");
const [root, connection, settings, folder, action, args] = JSON.parse(process.argv[process.argv.length - 1]);
const send = (value) => console.log(${JSON.stringify(MARKER)} + JSON.stringify(value));
(async () => {
  let db;
  try {
    const env = path.join(root, ".env");
    if (fs.existsSync(env) && typeof process.loadEnvFile === "function") process.loadEnvFile(env);
    let core;
    try { core = require(require.resolve("@meghjs/core", { paths: [root] })); }
    catch { throw new Error("@meghjs/core is not installed in this project."); }
    if (typeof core.Migrations !== "function") throw new Error("This @meghjs/core version has no migrations; upgrade it.");
    if (connection) {
      const mod = require(connection);
      db = mod && (mod.default || mod.db);
      if (!db || typeof db.schema !== "object" || typeof db.destroy !== "function") {
        throw new Error("The connection module must export a Kysely instance as its default export or as \`db\`.");
      }
    } else {
      if (typeof core.createDatabase !== "function") {
        throw new Error("This @meghjs/core version can't connect from DATABASE_URL; upgrade it, or export a Kysely instance from src/database/connection.ts.");
      }
      db = core.createDatabase(core.resolveDatabaseOptions(settings));
    }
    const migrations = new core.Migrations(db, { folder });
    send({ ok: true, result: await migrations[action](...args) });
  } catch (e) {
    send({ ok: false, error: (e && e.message) || String(e), completed: (e && e.completed) || [] });
  } finally {
    if (db) await db.destroy().catch(() => {});
    process.exit(0);
  }
})();
`;

function compiled(root: string) {
  const layout = projectLayout(root);
  const paths = databasePaths(root);
  const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");
  if (paths.connection && !fs.existsSync(paths.connection)) {
    throw new CliError(
      `No database connection module at ${rel(paths.connection)}.\n` +
        'Remove "megh.database" from package.json to connect from DATABASE_URL, as app.useMeghORM() does.',
    );
  }

  const cacheDir = path.join(root, "node_modules", ".cache", "megh", "migrate");
  fs.rmSync(cacheDir, { recursive: true, force: true });
  const inside = (dir: string, file: string) => {
    const r = path.relative(dir, file);
    return !r.startsWith("..") && !path.isAbsolute(r);
  };

  const app = new SwcCompiler(layout.srcDir, path.join(cacheDir, "app"), layout.compilerOptions);
  const failures = app.compileAll();
  // Migrations outside the source folder are compiled on their own.
  const migrationsCompiler = inside(layout.srcDir, paths.migrations)
    ? app
    : new SwcCompiler(paths.migrations, path.join(cacheDir, "migrations"), layout.compilerOptions);
  if (migrationsCompiler !== app) {
    for (const [file, error] of migrationsCompiler.compileAll()) failures.set(file, error);
  }
  if (failures.size) {
    const list = [...failures].map(([f, e]) => `${rel(f)}: ${e.split("\n")[0]}`).join("\n  ");
    throw new CliError(`Compilation failed:\n  ${list}`);
  }

  if (paths.connection && !inside(layout.srcDir, paths.connection)) {
    throw new CliError(`The connection module ${rel(paths.connection)} must be inside ${rel(layout.srcDir)}/.`);
  }
  return {
    connection: paths.connection ? app.outFileFor(paths.connection) : null,
    settings: paths.settings,
    // outFileFor maps a file; map a placeholder inside the folder and take its directory.
    migrations: path.dirname(migrationsCompiler.outFileFor(path.join(paths.migrations, "x.ts"))),
  };
}

/** Run a migration action in a child process and return its result. */
export function runMigrations(action: MigrateAction, opts: MigrateOptions = {}): any {
  const root = requireProjectRoot(opts.cwd ?? process.cwd());
  const files = compiled(root);
  const args = action === "rollback" ? [opts.step ?? 1] : [];
  const result = spawnSync(
    process.execPath,
    ["-e", WORKER, JSON.stringify([root, files.connection, files.settings, files.migrations, action, args])],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "development" },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  // Anything the app logs while loading is passed through.
  const lines = (result.stdout ?? "").split(/\r?\n/);
  const line = lines.find((l) => l.startsWith(MARKER));
  for (const l of lines) if (l && !l.startsWith(MARKER)) console.log(l);
  if (!line) {
    throw new CliError(`Could not run migrations:\n${result.stderr || result.stdout || result.error?.message}`);
  }
  const out = JSON.parse(line.slice(MARKER.length));
  if (!out.ok) {
    const done = out.completed.length ? `\nCompleted before the failure:\n  ${out.completed.join("\n  ")}` : "";
    throw new CliError(`${out.error}${done}`);
  }
  return out.result;
}

function list(names: string[], verb: string, empty: string) {
  if (names.length === 0) {
    log.info(empty);
    return;
  }
  for (const name of names) log.success(`${verb} ${name}`);
}

export function migrate(opts: MigrateOptions = {}): string[] {
  const names: string[] = runMigrations("latest", opts);
  list(names, "Migrated:", "Nothing to migrate.");
  return names;
}

export function migrateRollback(opts: MigrateOptions = {}): string[] {
  const names: string[] = runMigrations("rollback", opts);
  list(names, "Rolled back:", "Nothing to roll back.");
  return names;
}

export function migrateReset(opts: MigrateOptions = {}): string[] {
  const names: string[] = runMigrations("reset", opts);
  list(names, "Rolled back:", "Nothing to roll back.");
  return names;
}

export function migrateRefresh(opts: MigrateOptions = {}): { down: string[]; up: string[] } {
  const result: { down: string[]; up: string[] } = runMigrations("refresh", opts);
  list(result.down, "Rolled back:", "Nothing to roll back.");
  list(result.up, "Migrated:", "Nothing to migrate.");
  return result;
}

export type MigrationStatusRow = { name: string; executedAt: string | null };

export function formatStatus(rows: MigrationStatusRow[]): string {
  if (rows.length === 0) return "No migrations found.";
  const width = Math.max("MIGRATION".length, ...rows.map((r) => r.name.length));
  const head = c.bold(`${"RAN".padEnd(5)}${"MIGRATION".padEnd(width + 2)}EXECUTED AT`);
  // Pad before coloring: color codes would count towards the width.
  const body = rows.map(
    (r) =>
      (r.executedAt ? c.green("✔".padEnd(5)) : c.yellow("·".padEnd(5))) +
      r.name.padEnd(width + 2) +
      (r.executedAt ? new Date(r.executedAt).toISOString() : c.dim("pending")),
  );
  return [head, ...body].join("\n");
}

export function migrateStatus(opts: MigrateOptions & { json?: boolean } = {}): MigrationStatusRow[] {
  const rows: MigrationStatusRow[] = runMigrations("status", opts);
  console.log(opts.json ? JSON.stringify(rows, null, 2) : formatStatus(rows));
  return rows;
}
