import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { databasePaths } from "../src/commands/migrate";
import { makeMigration, makeSeeder } from "../src/generators/make";
import { runCli } from "../src/program";

describe("make:seeder", () => {
  let tmp: string;
  let out: string[];
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "megh-seed-"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x" }));
    out = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFileSync(file, "utf8");
  const rel = (file: string) => path.relative(tmp, file).split(path.sep).join("/");

  it("writes src/database/seeders/<name>.seeder.ts, named after the table", () => {
    const file = makeSeeder("users", { cwd: tmp });
    expect(rel(file)).toBe("src/database/seeders/users.seeder.ts");
    expect(read(file)).toContain('import { defineSeeder } from "@meghjs/core";');
    expect(read(file)).toContain('DB.table("users")');
    expect(rel(makeSeeder("BlogPostSeeder", { cwd: tmp }))).toBe("src/database/seeders/blog_post.seeder.ts");
    expect(out.join("\n")).toMatch(/runs every seeder in file-name order[\s\S]*megh make:seeder database/);
  });

  it("make:seeder database calls the existing seeders", () => {
    const empty = read(makeSeeder("database", { cwd: tmp }));
    expect(empty).toContain("async run() {");
    expect(empty).toContain('// Add { call } to run()\'s parameters, then: await call("roles", "users");');

    makeSeeder("users", { cwd: tmp });
    makeSeeder("roles", { cwd: tmp });
    const entry = read(makeSeeder("database", { cwd: tmp, force: true }));
    expect(entry).toContain("async run({ call }) {");
    expect(entry).toContain('await call("roles", "users");');

    out.length = 0;
    makeSeeder("tags", { cwd: tmp });
    expect(out.join("\n")).toContain('Run it from src/database/seeders/database.seeder.ts: await call("tags");');
  });

  it("honours megh.seeders, refuses nested names and existing files", () => {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x", megh: { seeders: "db/seeds" } }));
    expect(databasePaths(tmp).seeders).toBe(path.join(tmp, "db", "seeds"));
    expect(rel(makeSeeder("users", { cwd: tmp }))).toBe("db/seeds/users.seeder.ts");
    expect(() => makeSeeder("users", { cwd: tmp })).toThrow(/already exists/);
    expect(() => makeSeeder("admin/users", { cwd: tmp })).toThrow(/plain name/);
  });
});

describe("db:seed", () => {
  let root: string;
  let out: string[];
  let err: string[];

  beforeEach(() => {
    const base = path.join(__dirname, "..", "node_modules", ".megh-test");
    fs.mkdirSync(base, { recursive: true });
    root = fs.mkdtempSync(path.join(base, "seed-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
    fs.writeFileSync(path.join(root, ".env"), `DATABASE_URL=sqlite:${path.join(root, "db.sqlite")}\n`);
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));

    fs.writeFileSync(
      makeMigration("create_roles_table", { cwd: root, now: new Date(2026, 0, 1) }),
      `import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("roles", (table) => {
      table.id();
      table.string("name");
    });
  },
  async down(schema) {
    await schema.drop("roles");
  },
});
`,
    );
    write(
      "src/models/role.model.ts",
      `import { AutoIncrement, Column, Model, PrimaryKey, Table } from "@meghjs/core";

@Table("roles")
export class Role extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
}
`,
    );
    write(
      "src/database/seeders/roles.seeder.ts",
      `import { defineSeeder } from "@meghjs/core";
import { Role } from "../../models/role.model";

export default defineSeeder({
  async run() {
    await Role.create({ name: "Admin" });
  },
});
`,
    );
    write(
      "src/database/seeders/editors.seeder.ts",
      `import { DB, defineSeeder } from "@meghjs/core";

export default defineSeeder({
  async run() {
    await DB.table("roles").insert({ name: "Editor" });
  },
});
`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };

  const roles = () => {
    const Database = require("better-sqlite3");
    const db = new Database(path.join(root, "db.sqlite"), { readonly: true });
    try {
      return db.prepare("select name from roles order by id").all().map((r: any) => r.name);
    } finally {
      db.close();
    }
  };

  it("migrate --seed runs every seeder in file-name order without a database seeder", async () => {
    expect(await runCli(["migrate", "--seed"], { cwd: root })).toBe(0);
    expect(roles()).toEqual(["Editor", "Admin"]);
    expect(out.join("\n")).toMatch(/Migrated: 20260101000000_create_roles_table[\s\S]*Seeded: editors[\s\S]*Seeded: roles/);
  });

  it("runs the database seeder, which picks the order; --seeder runs one", async () => {
    await runCli(["migrate"], { cwd: root });
    write(
      "src/database/seeders/database.seeder.ts",
      `import { defineSeeder } from "@meghjs/core";

export default defineSeeder({
  async run({ call }) {
    await call("roles", "editors");
  },
});
`,
    );
    expect(await runCli(["db:seed"], { cwd: root })).toBe(0);
    expect(roles()).toEqual(["Admin", "Editor"]);

    expect(await runCli(["db:seed", "--seeder", "editors"], { cwd: root })).toBe(0);
    expect(roles()).toEqual(["Admin", "Editor", "Editor"]);

    expect(await runCli(["migrate:refresh", "--seed"], { cwd: root })).toBe(0);
    expect(roles()).toEqual(["Admin", "Editor"]);
  });

  it("saves nothing when a seeder fails, and says which one", async () => {
    await runCli(["migrate"], { cwd: root });
    write(
      "src/database/seeders/zz_broken.seeder.ts",
      `import { defineSeeder } from "@meghjs/core";
export default defineSeeder({ async run() { throw new Error("boom"); } });
`,
    );
    expect(await runCli(["db:seed"], { cwd: root })).toBe(1);
    expect(err.join("\n")).toContain("Seeder zz_broken failed: boom");
    expect(err.join("\n")).toContain("Nothing was saved.");
    expect(roles()).toEqual([]);
  });

  it("explains an unknown seeder and an empty folder", async () => {
    await runCli(["migrate"], { cwd: root });
    expect(await runCli(["db:seed", "-s", "nope"], { cwd: root })).toBe(1);
    expect(err.join("\n")).toContain('There is no seeder named "nope". Seeders: editors, roles.');

    fs.rmSync(path.join(root, "src", "database", "seeders"), { recursive: true });
    out.length = 0;
    expect(await runCli(["db:seed"], { cwd: root })).toBe(0);
    expect(out.join("\n")).toContain("Nothing to seed");
  });

  it("refuses to seed in production without --force", async () => {
    await runCli(["migrate"], { cwd: root });
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(await runCli(["db:seed"], { cwd: root })).toBe(1);
      expect(err.join("\n")).toContain("NODE_ENV is production. Pass --force to seed anyway.");
      expect(roles()).toEqual([]);
      expect(await runCli(["db:seed", "--force"], { cwd: root })).toBe(0);
      expect(roles()).toEqual(["Editor", "Admin"]);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
