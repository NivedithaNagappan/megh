/**
 * Seeders: code that fills the database with rows, for development, tests
 * and demos.
 *
 * A seeder is a module whose default export is `defineSeeder({ run })`. It is
 * named after its file without `.seeder.ts`: `src/database/seeders/
 * users.seeder.ts` is `users`. `megh db:seed` runs the `database` seeder,
 * which calls the others in the order you choose; without one, every seeder
 * runs in file-name order. `megh make:seeder` creates them.
 *
 * A whole run is one transaction: if a seeder throws, nothing is saved.
 */
import fs from "node:fs";
import path from "node:path";
import type { Kysely } from "kysely";
import { hasConnection, setConnection, transactionOn } from "./connection";
import { loadMigrationFile } from "./migrations";

/** What a seeder's `run()` receives. */
export interface SeedContext {
  /** The connection, inside the seeding transaction. Models use it too. */
  db: Kysely<any>;
  /** Run other seeders, by name, in this order: `await call("roles", "users")`. */
  call(...seeders: string[]): Promise<void>;
}

export interface Seeder {
  run(context: SeedContext): Promise<void>;
}

/**
 * Define a seeder:
 *
 * ```ts
 * export default defineSeeder({
 *   async run() {
 *     await Role.create({ name: "Admin" });
 *     await DB.table("settings").insert([{ key: "theme", value: "dark" }]);
 *   },
 * });
 * ```
 */
export function defineSeeder(seeder: Seeder): Seeder {
  return seeder;
}

/** The seeder `run()` starts from when it is given no name. */
export const ENTRY_SEEDER = "database";

export interface SeedersOptions {
  /** Folder of seeder files (`.js`, `.cjs`, `.mjs`, `.ts`, …). */
  folder?: string;
  /** Seeders given directly, keyed by name. Used instead of `folder`. */
  seeders?: Record<string, Seeder>;
  /** Run in one transaction, so a failure saves nothing. Defaults to `true`. */
  transaction?: boolean;
}

/** A seeder failed, or a name doesn't match one. */
export class SeedError extends Error {
  constructor(
    message: string,
    readonly seeder: string | undefined,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SeedError";
  }
}

const EXTENSIONS = /\.(c?js|mjs|c?ts|mts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;

/** A seeder's name: its file name without the extension and `.seeder`. */
export function seederName(file: string): string {
  return file.replace(EXTENSIONS, "").replace(/\.seeder$/, "");
}

/** Seeders in `folder`, keyed by name, in file-name order. */
export async function readSeederFolder(
  folder: string,
): Promise<Record<string, Seeder>> {
  if (!fs.existsSync(folder)) return {};
  const out: Record<string, Seeder> = {};
  for (const file of fs.readdirSync(folder).sort()) {
    if (!EXTENSIONS.test(file) || DECLARATION.test(file)) continue;
    const mod = await loadMigrationFile(path.join(folder, file));
    const seeder = typeof mod?.run === "function" ? mod : mod?.default;
    if (typeof seeder?.run !== "function") {
      throw new SeedError(
        `[Megh ORM] Seeder ${file} must export defineSeeder({ run }) as its default export.`,
        seederName(file),
      );
    }
    out[seederName(file)] = seeder;
  }
  return out;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Runs seeders on a connection:
 *
 * ```ts
 * const seeders = new Seeders(db, { folder: "dist/database/seeders" });
 * await seeders.run();        // the "database" seeder, else all of them
 * await seeders.run("users"); // one seeder
 * ```
 */
export class Seeders {
  constructor(
    private readonly db: Kysely<any>,
    private readonly options: SeedersOptions = {},
  ) {}

  /** Seeder names, in file-name order. */
  async list(): Promise<string[]> {
    return Object.keys(await this.load());
  }

  /**
   * Run the seeder `name`; without one, the `database` seeder, or else every
   * seeder in file-name order. Returns the seeders that ran, in order.
   */
  async run(name?: string): Promise<string[]> {
    const seeders = await this.load();
    const names = Object.keys(seeders);
    if (name !== undefined && !seeders[name]) {
      throw new SeedError(
        `There is no seeder named "${name}". ` +
          (names.length
            ? `Seeders: ${names.join(", ")}.`
            : "There are no seeders."),
        name,
      );
    }
    const start =
      name !== undefined
        ? [name]
        : seeders[ENTRY_SEEDER]
          ? [ENTRY_SEEDER]
          : names;
    if (start.length === 0) return [];

    // Models in a seeder use the ORM connection: point it at `db` if unset.
    if (!hasConnection()) setConnection(this.db);

    const ran: string[] = [];
    const stack: string[] = [];
    const runOne = async (
      seederToRun: string,
      db: Kysely<any>,
    ): Promise<void> => {
      const seeder = seeders[seederToRun];
      if (!seeder) {
        throw new SeedError(
          `Seeder ${stack[stack.length - 1]} calls "${seederToRun}", which doesn't exist. Seeders: ${names.join(", ")}.`,
          stack[stack.length - 1],
        );
      }
      if (stack.includes(seederToRun)) {
        throw new SeedError(
          `Seeders call each other in a loop: ${[...stack, seederToRun].join(" → ")}.`,
          seederToRun,
        );
      }
      stack.push(seederToRun);
      ran.push(seederToRun);
      try {
        await seeder.run({
          db,
          call: async (...others) => {
            for (const other of others) await runOne(other, db);
          },
        });
      } catch (error) {
        // Report the innermost failing seeder once.
        if (error instanceof SeedError) throw error;
        throw new SeedError(
          `Seeder ${seederToRun} failed: ${describe(error)}`,
          seederToRun,
          error,
        );
      } finally {
        stack.pop();
      }
    };

    const runAll = async (db: Kysely<any>) => {
      for (const seeder of start) await runOne(seeder, db);
    };
    if (this.options.transaction === false) await runAll(this.db);
    else await transactionOn(this.db, runAll);
    return ran;
  }

  private load(): Promise<Record<string, Seeder>> {
    if (this.options.seeders) return Promise.resolve(this.options.seeders);
    if (!this.options.folder) {
      throw new SeedError(
        "[Megh ORM] Seeders need a folder or a seeders map.",
        undefined,
      );
    }
    return readSeederFolder(this.options.folder);
  }
}
