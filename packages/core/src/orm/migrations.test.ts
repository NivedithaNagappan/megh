import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { MigrationError, Migrations, type Migration } from "./index";

let db: Kysely<any>;

const tables = async () =>
  (await db.introspection.getTables()).map((t) => t.name).sort();

const createTable = (name: string): Migration => ({
  up: async (db) => {
    await db.schema
      .createTable(name)
      .addColumn("id", "integer", (c) => c.primaryKey())
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable(name).execute();
  },
});

beforeEach(() => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
});

afterEach(async () => {
  await db.destroy();
});

describe("Migrations", () => {
  const migrations = {
    "20260101000000_create_users": createTable("users"),
    "20260102000000_create_posts": createTable("posts"),
    "20260103000000_create_tags": createTable("tags"),
  };

  it("latest() runs pending migrations in name order, once", async () => {
    const m = new Migrations(db, { migrations });
    expect(await m.latest()).toEqual(Object.keys(migrations));
    expect(await tables()).toEqual(["posts", "tags", "users"]);
    expect(await m.latest()).toEqual([]);
  });

  it("status() lists executed and pending migrations", async () => {
    const m = new Migrations(db, {
      migrations: {
        "20260101000000_create_users":
          migrations["20260101000000_create_users"],
      },
    });
    await m.latest();
    const all = new Migrations(db, { migrations });
    const status = await all.status();
    expect(status.map((s) => [s.name, s.executedAt instanceof Date])).toEqual([
      ["20260101000000_create_users", true],
      ["20260102000000_create_posts", false],
      ["20260103000000_create_tags", false],
    ]);
  });

  it("rollback() undoes the last migration, or the last n", async () => {
    const m = new Migrations(db, { migrations });
    await m.latest();
    expect(await m.rollback()).toEqual(["20260103000000_create_tags"]);
    expect(await m.rollback(5)).toEqual([
      "20260102000000_create_posts",
      "20260101000000_create_users",
    ]);
    expect(await m.rollback()).toEqual([]);
    expect(await tables()).toEqual([]);
  });

  it("reset() undoes everything; refresh() reruns everything", async () => {
    const m = new Migrations(db, { migrations });
    await m.latest();
    expect(await m.refresh()).toEqual({
      down: Object.keys(migrations).reverse(),
      up: Object.keys(migrations),
    });
    expect(await m.reset()).toEqual(Object.keys(migrations).reverse());
    expect((await m.status()).every((s) => s.executedAt === null)).toBe(true);
  });

  it("a failing migration throws MigrationError and keeps earlier ones", async () => {
    const m = new Migrations(db, {
      migrations: {
        "1_ok": createTable("ok"),
        "2_bad": {
          up: async () => {
            throw new Error("boom");
          },
        },
        "3_never": createTable("never"),
      },
    });
    const error = await m.latest().catch((e) => e);
    expect(error).toBeInstanceOf(MigrationError);
    expect(error.message).toBe("Migration 2_bad failed: boom");
    expect(error.migration).toBe("2_bad");
    expect(error.completed).toEqual(["1_ok"]);
    expect(await tables()).not.toContain("never");
  });

  it("uses a custom migration table", async () => {
    await new Migrations(db, {
      migrations,
      table: "megh_migrations",
      lockTable: "megh_migrations_lock",
    }).latest();
    expect(await tables()).toContain("megh_migrations");
  });

  describe("folder", () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "megh-migrations-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const write = (name: string, body: string) =>
      fs.writeFileSync(path.join(dir, name), body);

    it("loads CommonJS, default-export and ES module files; ignores others", async () => {
      write(
        "20260101000000_create_users.js",
        `exports.up = (db) => db.schema.createTable("users").addColumn("id", "integer").execute();
         exports.down = (db) => db.schema.dropTable("users").execute();`,
      );
      write(
        "20260102000000_create_posts.cjs",
        `module.exports = { default: {
           up: (db) => db.schema.createTable("posts").addColumn("id", "integer").execute() } };`,
      );
      write(
        "20260103000000_create_tags.mjs",
        `export async function up(db) {
           await db.schema.createTable("tags").addColumn("id", "integer").execute(); }`,
      );
      write("README.md", "not a migration");
      write("types.d.ts", "export {};");

      const m = new Migrations(db, { folder: dir });
      expect(await m.latest()).toEqual([
        "20260101000000_create_users",
        "20260102000000_create_posts",
        "20260103000000_create_tags",
      ]);
      expect(await tables()).toEqual(["posts", "tags", "users"]);
    });

    it("rejects a file without up()", async () => {
      write("1_broken.js", "exports.nope = 1;");
      await expect(
        new Migrations(db, { folder: dir }).latest(),
      ).rejects.toThrow(/1_broken.js must export an `up\(db\)` function/);
    });

    it("a missing folder means no migrations", async () => {
      expect(
        await new Migrations(db, { folder: path.join(dir, "nope") }).latest(),
      ).toEqual([]);
    });
  });
});
