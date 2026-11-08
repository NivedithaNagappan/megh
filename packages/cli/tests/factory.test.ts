import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeValue } from "../src/generators/factory";
import { makeFactory, makeModel, makeSeeder } from "../src/generators/make";
import { runCli } from "../src/program";

const migration = (root: string, name: string, body: string) => {
  const dir = path.join(root, "src", "database", "migrations");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, name),
    `import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
${body}
  },
  async down() {},
});
`,
  );
};

const CREATE_TABLES = `    await schema.create("roles", (table) => {
      table.id();
      table.string("name");
    });
    await schema.create("users", (table) => {
      table.id();
      table.string("name");
      table.string("email").unique();
      table.string("phone", 20).nullable();
      table.text("bio").nullable();
      table.boolean("is_active").default(true);
      table.decimal("balance", 10, 2).default(0);
      table.integer("age").nullable();
      table.date("born_on").nullable();
      table.json("settings").nullable();
      table.foreignId("role_id").constrained("roles");
      table.foreignId("team_id").nullable();
      table.timestamps();
    });`;

describe("make:factory", () => {
  let tmp: string;
  let out: string[];
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "megh-factory-"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x" }));
    out = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "warn").mockImplementation((m) => void out.push(String(m)));
    migration(tmp, "20260101000000_create_tables.ts", CREATE_TABLES);
    makeModel("role", { cwd: tmp });
    makeModel("user", { cwd: tmp });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFileSync(file, "utf8");

  it("fills each column with a Faker value picked from its name and type", () => {
    const file = makeFactory("user", { cwd: tmp });
    expect(path.relative(tmp, file).split(path.sep).join("/")).toBe("src/database/factories/user.factory.ts");
    const source = read(file);
    expect(source).toContain('import { defineFactory } from "@meghjs/core";');
    expect(source).toContain('import { User } from "../../models/user.model";');
    expect(source).toContain("export const UserFactory = defineFactory(User, ({ faker }) => ({");
    for (const line of [
      "name: faker.person.fullName(),",
      "email: faker.internet.email(),",
      'phone: faker.phone.number({ style: "international" }).slice(0, 20),',
      "bio: faker.lorem.paragraph(),",
      "is_active: faker.datatype.boolean(),",
      "balance: faker.number.float({ min: 0, max: 1000, fractionDigits: 2 }),",
      "age: faker.number.int({ min: 18, max: 90 }),",
      "born_on: faker.date.birthdate(),",
      "settings: {},",
      "team_id: null,",
      "// role_id: RoleFactory, (create it: megh make:factory role)",
    ]) {
      expect(source).toContain(line);
    }
    // The generated key and timestamps are left to the database and the ORM.
    expect(source).not.toMatch(/\bid:|created_at|updated_at/);
    expect(out.join("\n")).toContain("npm install -D @faker-js/faker");
  });

  it("uses the related model's factory for a foreign key when it exists", () => {
    const role = read(makeFactory("RoleFactory", { cwd: tmp }));
    expect(role).toContain("name: faker.word.noun(),");
    const user = read(makeFactory("user", { cwd: tmp, force: true }));
    expect(user).toContain('import { RoleFactory } from "./role.factory";');
    expect(user).toContain("role_id: RoleFactory,");
  });

  it("explains a missing model and refuses to overwrite", () => {
    expect(() => makeFactory("post", { cwd: tmp })).toThrow(/no Post model[\s\S]*megh make:model Post/);
    makeFactory("user", { cwd: tmp });
    expect(() => makeFactory("user", { cwd: tmp })).toThrow(/already exists/);
  });

  it("picks values for common column names", () => {
    const value = (name: string, ts: string, sqlType?: string, model = "User") =>
      fakeValue({ name, ts, nullable: false, generated: false, sqlType }, model);
    expect(value("name", "string", undefined, "Product")).toBe("faker.commerce.productName()");
    expect(value("name", "string", undefined, "Account")).toBe("faker.company.name()");
    expect(value("uuid", "string")).toBe("faker.string.uuid()");
    expect(value("avatar_url", "string")).toBe("faker.image.avatar()");
    expect(value("expires_at", "Date")).toBe("faker.date.future()");
    expect(value("code", "string", "varchar(6)")).toBe("faker.string.alphanumeric(6).toUpperCase()");
    expect(value("sku", "string")).toBe("faker.string.alphanumeric(8).toUpperCase()");
    expect(value("title", "string", "varchar(40)")).toBe("faker.lorem.sentence().slice(0, 40)");
    expect(value("initials", "string", "varchar(4)")).toBe("faker.string.alphanumeric(4)");
    expect(value("data", "Buffer")).toBeUndefined();
  });
});

describe("factories in db:seed", () => {
  let root: string;
  let err: string[];

  beforeEach(() => {
    const base = path.join(__dirname, "..", "node_modules", ".megh-test");
    fs.mkdirSync(base, { recursive: true });
    root = fs.mkdtempSync(path.join(base, "factory-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
    fs.writeFileSync(path.join(root, ".env"), `DATABASE_URL=sqlite:${path.join(root, "db.sqlite")}\n`);
    err = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("generated factories seed rows with fake values, related rows included", async () => {
    migration(root, "20260101000000_create_tables.ts", CREATE_TABLES);
    makeModel("role", { cwd: root });
    makeModel("user", { cwd: root });
    makeFactory("role", { cwd: root });
    makeFactory("user", { cwd: root });
    const seeder = makeSeeder("users", { cwd: root });
    fs.writeFileSync(
      seeder,
      `import { defineSeeder } from "@meghjs/core";
import { UserFactory } from "../factories/user.factory";

export default defineSeeder({
  async run() {
    await UserFactory.createMany(5);
  },
});
`,
    );

    expect(await runCli(["migrate", "--seed"], { cwd: root })).toBe(0);
    expect(err).toEqual([]);
    const Database = require("better-sqlite3");
    const db = new Database(path.join(root, "db.sqlite"), { readonly: true });
    try {
      const users = db.prepare("select * from users").all();
      expect(users).toHaveLength(5);
      expect(users.every((u: any) => /@/.test(u.email) && u.name.length > 0)).toBe(true);
      expect(new Set(users.map((u: any) => u.email)).size).toBe(5);
      // Each user got its own role from RoleFactory.
      expect(db.prepare("select count(*) as n from roles").get().n).toBe(5);
      expect(users.every((u: any) => u.role_id > 0)).toBe(true);
    } finally {
      db.close();
    }
  });
});
