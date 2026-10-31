import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { databasePaths, formatStatus } from "../src/commands/migrate";
import { makeMigration, migrationTimestamp } from "../src/generators/make";
import { runCli } from "../src/program";

const NOW = new Date(2026, 10, 1, 9, 30, 5); // local time

describe("make:migration", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avleon-mig-"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x" }));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFileSync(file, "utf8");

  it("names files <YYYYMMDDHHmmss>_<snake_name>.ts in src/database/migrations", () => {
    expect(migrationTimestamp(NOW)).toBe("20261101093005");
    const file = makeMigration("CreateUsersTable", { cwd: tmp, now: NOW });
    expect(path.relative(tmp, file).split(path.sep).join("/")).toBe(
      "src/database/migrations/20261101093005_create_users_table.ts",
    );
  });

  it("create_<table>_table gives a create-table migration", () => {
    const content = read(makeMigration("create_blog_posts_table", { cwd: tmp, now: NOW }));
    expect(content).toContain('.createTable("blog_posts")');
    expect(content).toContain('.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())');
    expect(content).toContain('await db.schema.dropTable("blog_posts").execute();');
  });

  it("uses serial ids for Postgres projects", () => {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x", dependencies: { pg: "^8" } }));
    const content = read(makeMigration("create_users_table", { cwd: tmp, now: NOW }));
    expect(content).toContain('.addColumn("id", "serial", (col) => col.primaryKey())');
  });

  it("add_x_to_<table>_table gives an alter-table migration", () => {
    const content = read(makeMigration("add_role_to_users_table", { cwd: tmp, now: NOW }));
    expect(content).toContain('alterTable("users")');
    expect(content).not.toContain("createTable");
  });

  it("--create / --table override the guess; other names are blank", () => {
    expect(read(makeMigration("users", { cwd: tmp, now: NOW, create: "people" }))).toContain('.createTable("people")');
    expect(read(makeMigration("add_index", { cwd: tmp, now: new Date(2026, 10, 1, 9, 31), table: "users" }))).toContain(
      'alterTable("users")',
    );
    const blank = read(makeMigration("seed_roles", { cwd: tmp, now: NOW }));
    expect(blank).toContain("export async function up(db: Kysely<any>)");
    expect(blank).not.toMatch(/createTable|alterTable/);
  });

  it("honours avleon.migrations and refuses to overwrite", () => {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x", avleon: { migrations: "db/migrations" } }));
    expect(databasePaths(tmp).migrations).toBe(path.join(tmp, "db", "migrations"));
    const file = makeMigration("create_users_table", { cwd: tmp, now: NOW });
    expect(file).toBe(path.join(tmp, "db", "migrations", "20261101093005_create_users_table.ts"));
    expect(() => makeMigration("create_users_table", { cwd: tmp, now: NOW })).toThrow(/already exists/);
  });

  it("formatStatus", () => {
    expect(formatStatus([])).toBe("No migrations found.");
    const out = formatStatus([
      { name: "1_a", executedAt: "2026-11-01T00:00:00.000Z" },
      { name: "2_b", executedAt: null },
    ]);
    expect(out).toContain("1_a");
    expect(out).toContain("2026-11-01T00:00:00.000Z");
    expect(out).toContain("pending");
  });
});

// ── End to end: compiles a project and runs migrations on SQLite ──────────
// The project lives under this package's node_modules so it resolves
// @avleon/core (built), kysely and better-sqlite3 from the workspace.

describe("migrate commands", () => {
  let root: string;
  let out: string[];
  let err: string[];

  beforeEach(() => {
    const base = path.join(__dirname, "..", "node_modules", ".avleon-test");
    fs.mkdirSync(base, { recursive: true });
    root = fs.mkdtempSync(path.join(base, "app-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
    fs.mkdirSync(path.join(root, "src", "database"), { recursive: true });
    fs.writeFileSync(path.join(root, ".env"), `DB_FILE=${path.join(root, "db.sqlite")}\n`);
    fs.writeFileSync(
      path.join(root, "src", "database", "connection.ts"),
      [
        'import { Kysely, SqliteDialect } from "kysely";',
        'import Database from "better-sqlite3";',
        "",
        "export default new Kysely<any>({",
        "  dialect: new SqliteDialect({ database: new Database(process.env.DB_FILE!) }),",
        "});",
      ].join("\n"),
    );
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const tables = () => {
    const Database = require("better-sqlite3");
    const db = new Database(path.join(root, "db.sqlite"), { readonly: true });
    try {
      return db
        .prepare("select name from sqlite_master where type = 'table' and name not like 'kysely_%' and name not like 'sqlite_%'")
        .all()
        .map((r: any) => r.name)
        .sort();
    } finally {
      db.close();
    }
  };

  it("migrate, migrate:status, migrate:rollback, migrate:refresh, migrate:reset", async () => {
    makeMigration("create_users_table", { cwd: root, now: new Date(2026, 0, 1) });
    makeMigration("create_posts_table", { cwd: root, now: new Date(2026, 0, 2) });

    expect(await runCli(["migrate"], { cwd: root })).toBe(0);
    expect(tables()).toEqual(["posts", "users"]);
    expect(out.join("\n")).toContain("Migrated: 20260101000000_create_users_table");

    out.length = 0;
    expect(await runCli(["migrate"], { cwd: root })).toBe(0);
    expect(out).toContain("Nothing to migrate.");

    out.length = 0;
    expect(await runCli(["migrate:status", "--json"], { cwd: root })).toBe(0);
    const status = JSON.parse(out.join("\n"));
    expect(status.map((s: any) => [s.name, typeof s.executedAt])).toEqual([
      ["20260101000000_create_users_table", "string"],
      ["20260102000000_create_posts_table", "string"],
    ]);

    expect(await runCli(["migrate:rollback"], { cwd: root })).toBe(0);
    expect(tables()).toEqual(["users"]);

    expect(await runCli(["migrate:refresh"], { cwd: root })).toBe(0);
    expect(tables()).toEqual(["posts", "users"]);

    expect(await runCli(["migrate:rollback", "--step", "2"], { cwd: root })).toBe(0);
    expect(tables()).toEqual([]);

    await runCli(["migrate"], { cwd: root });
    expect(await runCli(["migrate:reset"], { cwd: root })).toBe(0);
    expect(tables()).toEqual([]);
  });

  it("reports a failing migration and what ran before it", async () => {
    makeMigration("create_users_table", { cwd: root, now: new Date(2026, 0, 1) });
    const bad = makeMigration("break_things", { cwd: root, now: new Date(2026, 0, 2) });
    fs.writeFileSync(bad, 'export async function up() { throw new Error("boom"); }\n');

    expect(await runCli(["migrate"], { cwd: root })).toBe(1);
    const message = err.join("\n");
    expect(message).toContain("Migration 20260102000000_break_things failed: boom");
    expect(message).toContain("20260101000000_create_users_table");
    expect(tables()).toEqual(["users"]);
  });

  it("explains a missing connection module", async () => {
    fs.rmSync(path.join(root, "src", "database", "connection.ts"));
    expect(await runCli(["migrate"], { cwd: root })).toBe(1);
    expect(err.join("\n")).toContain("No database connection module at src/database/connection.ts");
  });
});
