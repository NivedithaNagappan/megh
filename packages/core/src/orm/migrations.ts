/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Schema migrations, run with Kysely's `Migrator`.
 *
 * A migration is a module whose default export is `defineMigration({ up,
 * down })`, which receive Megh's schema builder. Modules exporting
 * `up(db)` / `down(db)` functions that take the Kysely instance still work.
 * Migrations run in file-name order, so names start with a timestamp:
 * `20261101093000_create_users_table.ts`. `megh make:migration` creates them.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Kysely } from "kysely";
import { Schema } from "./schema";

/** A migration as the runner calls it. */
export interface Migration {
  up(db: Kysely<any>): Promise<void>;
  down?(db: Kysely<any>): Promise<void>;
}

/** A migration written with the schema builder. */
export interface SchemaMigration {
  up(schema: Schema): Promise<void>;
  /** Undo `up()`. Without it, the migration can't be rolled back. */
  down?(schema: Schema): Promise<void>;
}

/**
 * Define a migration with Megh's schema builder:
 *
 * ```ts
 * export default defineMigration({
 *   async up(schema) {
 *     await schema.create("users", (table) => {
 *       table.id();
 *       table.string("email").unique();
 *       table.timestamps();
 *     });
 *   },
 *   async down(schema) {
 *     await schema.drop("users");
 *   },
 * });
 * ```
 */
export function defineMigration(migration: SchemaMigration): Migration {
  const { up, down } = migration;
  return {
    up: (db) => up.call(migration, new Schema(db)),
    ...(down
      ? { down: (db: Kysely<any>) => down.call(migration, new Schema(db)) }
      : {}),
  };
}

export interface MigrationsOptions {
  /** Folder of migration files (`.js`, `.cjs`, `.mjs`, `.ts`, …). */
  folder?: string;
  /** Migrations given directly, keyed by name. Used instead of `folder`. */
  migrations?: Record<string, Migration>;
  /** Table recording executed migrations. Defaults to Kysely's `kysely_migration`. */
  table?: string;
  /** Lock table. Defaults to Kysely's `kysely_migration_lock`. */
  lockTable?: string;
}

export interface MigrationStatus {
  name: string;
  /** When it ran, or `null` if pending. */
  executedAt: Date | null;
}

/** A migration run failed. `completed` lists the migrations that did run. */
export class MigrationError extends Error {
  constructor(
    message: string,
    readonly migration: string | undefined,
    readonly completed: string[],
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

const EXTENSIONS = /\.(c?js|mjs|c?ts|mts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;

// A real dynamic import: TypeScript compiles `import()` to `require()` in
// CommonJS output, which cannot load ES modules.
const nativeImport = new Function("url", "return import(url)") as (
  url: string,
) => Promise<any>;

/**
 * `require()` first: it loads CommonJS everywhere and ES modules on Node
 * 20.19+ / 22.12+. A native `import()` covers what it can't, such as `.ts`
 * files under a loader hook.
 */
async function loadMigrationFile(file: string): Promise<any> {
  try {
    return require(file);
  } catch (err) {
    try {
      return await nativeImport(pathToFileURL(file).href);
    } catch {
      throw err;
    }
  }
}

/** Migrations in `folder`, keyed by file name without extension. */
export async function readMigrationFolder(
  folder: string,
): Promise<Record<string, Migration>> {
  if (!fs.existsSync(folder)) return {};
  const out: Record<string, Migration> = {};
  for (const file of fs.readdirSync(folder).sort()) {
    if (!EXTENSIONS.test(file) || DECLARATION.test(file)) continue;
    const mod = await loadMigrationFile(path.join(folder, file));
    const migration = typeof mod?.up === "function" ? mod : mod?.default;
    if (typeof migration?.up !== "function") {
      throw new Error(
        `[Megh ORM] Migration ${file} must export defineMigration({ up, down }) as its default export.`,
      );
    }
    out[file.replace(EXTENSIONS, "")] = migration;
  }
  return out;
}

/**
 * Kysely's migration module. Required at runtime: it's a subpath export,
 * which this package's CommonJS module resolution can't type.
 */
function kyselyMigration(): any {
   
  return require("kysely/migration");
}

/**
 * Run schema migrations against `db`.
 *
 * ```ts
 * const migrations = new Migrations(db, { folder: "dist/database/migrations" });
 * await migrations.latest();
 * ```
 */
export class Migrations {
  constructor(
    private readonly db: Kysely<any>,
    private readonly options: MigrationsOptions,
  ) {
    if (!options.folder && !options.migrations) {
      throw new Error("[Megh ORM] Migrations need a `folder` or `migrations`.");
    }
  }

  private migrator(): any {
    const { Migrator, NO_MIGRATIONS } = kyselyMigration();
    const { folder, migrations, table, lockTable } = this.options;
    const migrator = new Migrator({
      db: this.db,
      provider: {
        getMigrations: async () =>
          migrations ?? (await readMigrationFolder(folder!)),
      },
      ...(table ? { migrationTableName: table } : {}),
      ...(lockTable ? { migrationLockTableName: lockTable } : {}),
    });
    return Object.assign(migrator, { NO_MIGRATIONS });
  }

  /** Run every pending migration. Returns the names that ran. */
  async latest(): Promise<string[]> {
    return run(await this.migrator().migrateToLatest());
  }

  /** Undo the last `steps` migrations (default 1). Returns the names undone. */
  async rollback(steps = 1): Promise<string[]> {
    const migrator = this.migrator();
    const undone: string[] = [];
    for (let i = 0; i < steps; i++) {
      const names = run(await migrator.migrateDown(), undone);
      if (names.length === 0) break;
      undone.push(...names);
    }
    return undone;
  }

  /** Undo every executed migration. Returns the names undone. */
  async reset(): Promise<string[]> {
    const migrator = this.migrator();
    return run(await migrator.migrateTo(migrator.NO_MIGRATIONS));
  }

  /** Undo every migration, then run them all again. */
  async refresh(): Promise<{ down: string[]; up: string[] }> {
    const down = await this.reset();
    const up = await this.latest();
    return { down, up };
  }

  /** Every known migration and when it ran. */
  async status(): Promise<MigrationStatus[]> {
    const list: any[] = await this.migrator().getMigrations();
    return list.map((m) => ({
      name: m.name,
      executedAt: m.executedAt ? new Date(m.executedAt) : null,
    }));
  }
}

/** Names that ran, or a {@link MigrationError} for a failed run. */
function run(
  result: { error?: unknown; results?: any[] },
  before: string[] = [],
): string[] {
  const results = result.results ?? [];
  const done = results
    .filter((r) => r.status === "Success")
    .map((r) => r.migrationName);
  if (result.error) {
    const failed = results.find((r) => r.status === "Error")?.migrationName;
    const reason =
      result.error instanceof Error
        ? result.error.message
        : String(result.error);
    throw new MigrationError(
      failed
        ? `Migration ${failed} failed: ${reason}`
        : `Migrations failed: ${reason}`,
      failed,
      [...before, ...done],
      result.error,
    );
  }
  return done;
}
