import "reflect-metadata";
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import {
  AutoIncrement,
  Column,
  DB,
  Model,
  PrimaryKey,
  SeedError,
  Seeders,
  Table,
  defineSeeder,
  readSeederFolder,
  seederName,
  type Seeder,
} from "./index";

@Table("seed_roles")
class Role extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
}

let db: Kysely<any>;
let log: string[];

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  Model.useConnection(db);
  await sql`create table seed_roles (id integer primary key autoincrement, name text not null unique)`.execute(
    db,
  );
  await sql`create table seed_users (id integer primary key autoincrement, email text not null, role_id integer)`.execute(
    db,
  );
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  log = [];
  await sql`delete from seed_users`.execute(db);
  await sql`delete from seed_roles`.execute(db);
});

const roles = defineSeeder({
  async run() {
    log.push("roles");
    await Role.create({ name: "Admin" });
    await Role.create({ name: "Editor" });
  },
});

const users = defineSeeder({
  async run({ db }) {
    log.push("users");
    const admin = await Role.findByOrFail("name", "Admin");
    await DB.table("seed_users").insert({
      email: "ann@example.com",
      role_id: admin.id,
    });
    // The context's db is the same transaction the models use.
    const count = await db
      .selectFrom("seed_users")
      .select(db.fn.countAll().as("n"))
      .executeTakeFirst();
    expect(Number(count!.n)).toBe(1);
  },
});

const seeders = (map: Record<string, Seeder>) =>
  new Seeders(db, { seeders: map });

describe("Seeders", () => {
  it("runs the database seeder, which calls the others in its order", async () => {
    const database = defineSeeder({
      async run({ call }) {
        log.push("database");
        await call("roles", "users");
      },
    });
    // Listed users-first: the database seeder's call() order wins.
    const ran = await seeders({ users, roles, database }).run();
    expect(ran).toEqual(["database", "roles", "users"]);
    expect(log).toEqual(["database", "roles", "users"]);
    expect(await Role.count()).toBe(2);
    expect(await DB.table("seed_users").count()).toBe(1);
  });

  it("runs every seeder in name order when there is no database seeder", async () => {
    expect(await seeders({ a_roles: roles, b_users: users }).run()).toEqual([
      "a_roles",
      "b_users",
    ]);
  });

  it("runs one seeder by name", async () => {
    expect(await seeders({ roles, users }).run("roles")).toEqual(["roles"]);
    expect(await Role.count()).toBe(2);
    expect(await DB.table("seed_users").count()).toBe(0);
  });

  it("does nothing without seeders", async () => {
    expect(await seeders({}).run()).toEqual([]);
  });

  it("saves nothing when a seeder fails, and names it", async () => {
    const broken = defineSeeder({
      async run() {
        throw new Error("boom");
      },
    });
    const database = defineSeeder({
      async run({ call }) {
        await call("roles", "broken");
      },
    });
    const error = await seeders({ roles, broken, database })
      .run()
      .catch((e) => e);
    expect(error).toBeInstanceOf(SeedError);
    expect(error.message).toBe("Seeder broken failed: boom");
    expect(error.seeder).toBe("broken");
    expect(await Role.count()).toBe(0);
  });

  it("reports unknown names and call loops", async () => {
    await expect(seeders({ roles }).run("nope")).rejects.toThrow(
      "There is no seeder named \"nope\". Seeders: roles.",
    );
    const database = defineSeeder({ run: ({ call }) => call("missing") });
    await expect(seeders({ database }).run()).rejects.toThrow(
      "Seeder database calls \"missing\", which doesn't exist.",
    );
    const a = defineSeeder({ run: ({ call }) => call("b") });
    const b = defineSeeder({ run: ({ call }) => call("a") });
    await expect(seeders({ a, b }).run("a")).rejects.toThrow(
      "Seeders call each other in a loop: a → b → a.",
    );
  });

  it("can run without a transaction", async () => {
    const broken = defineSeeder({
      async run() {
        await Role.create({ name: "Kept" });
        throw new Error("boom");
      },
    });
    await expect(
      new Seeders(db, { seeders: { broken }, transaction: false }).run(),
    ).rejects.toThrow("boom");
    expect(await Role.count()).toBe(1);
  });
});

describe("seeder files", () => {
  let folder: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "megh-seeders-"));
  });

  it("are named after the file without .seeder", () => {
    expect(seederName("users.seeder.ts")).toBe("users");
    expect(seederName("database.seeder.js")).toBe("database");
    expect(seederName("roles.ts")).toBe("roles");
  });

  it("load from a folder: default export or a run() export", async () => {
    fs.writeFileSync(
      path.join(folder, "b.seeder.js"),
      "exports.default = { async run() {} };",
    );
    fs.writeFileSync(
      path.join(folder, "a.seeder.js"),
      "exports.run = async () => {};",
    );
    fs.writeFileSync(path.join(folder, "a.seeder.d.ts"), "export {};");
    fs.writeFileSync(path.join(folder, "notes.txt"), "ignored");
    expect(Object.keys(await readSeederFolder(folder))).toEqual(["a", "b"]);
    expect(await new Seeders(db, { folder }).list()).toEqual(["a", "b"]);
    expect(
      Object.keys(await readSeederFolder(path.join(folder, "missing"))),
    ).toEqual([]);
  });

  it("explain a file without a seeder", async () => {
    fs.writeFileSync(
      path.join(folder, "bad.seeder.js"),
      "exports.default = {};",
    );
    await expect(readSeederFolder(folder)).rejects.toThrow(
      "Seeder bad.seeder.js must export defineSeeder({ run }) as its default export.",
    );
  });
});
