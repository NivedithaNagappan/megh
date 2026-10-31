import "reflect-metadata";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { Model, belongsToMany, type CustomCast } from "./index";

// ─── Models ──────────────────────────────────────────────────────────────────

const csv: CustomCast<string[], string> = {
  get: (v) => (v === "" ? [] : v.split(",")),
  set: (v) => v.join(","),
};

class Member extends Model {
  static readonly table = "members";
  static readonly timestamps = true;
  static readonly softDeletes = true;
  static readonly casts = {
    is_admin: "boolean",
    settings: "json",
    born_on: "date",
    balance: "number",
    tags: csv,
  } as const;

  id: number;
  email: string;
  is_admin: boolean;
  settings: { theme: string } | null;
  born_on: Date | null;
  balance: number;
  tags: string[];
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;

  roles = belongsToMany(() => Role).withPivot<{ granted_by: string | null }>(
    "granted_by",
  );
}

class Role extends Model {
  static readonly table = "roles";
  static readonly softDeletes = true;

  id: number;
  name: string;
  deleted_at: Date | null;

  members = belongsToMany(() => Member);
  permissions = belongsToMany(() => Permission); // pivot: permission_role
}

class Permission extends Model {
  static readonly table = "permissions";

  id: number;
  name: string;
}

// ─── Harness ─────────────────────────────────────────────────────────────────

const queries: string[] = [];
let db: Kysely<any>;

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
    log: (e) => {
      if (e.level === "query") queries.push(e.query.sql.replace(/"/g, ""));
    },
  });
  for (const ddl of [
    sql`create table members (id integer primary key autoincrement, email text not null, is_admin integer not null default 0, settings text, born_on text, balance text not null default '0', tags text not null default '', created_at text not null, updated_at text not null, deleted_at text)`,
    sql`create table roles (id integer primary key autoincrement, name text not null, deleted_at text)`,
    sql`create table permissions (id integer primary key autoincrement, name text not null)`,
    sql`create table member_role (member_id integer not null, role_id integer not null, granted_by text)`,
    sql`create table permission_role (permission_id integer not null, role_id integer not null)`,
  ]) {
    await ddl.execute(db);
  }
  Model.useConnection(db);
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  for (const table of [
    "members",
    "roles",
    "permissions",
    "member_role",
    "permission_role",
  ]) {
    await sql`delete from ${sql.table(table)}`.execute(db);
  }
  await sql`delete from sqlite_sequence`.execute(db);
  queries.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

const raw = (table: string) =>
  Model.db().selectFrom(table).selectAll().execute();

// ─── Timestamps ──────────────────────────────────────────────────────────────

describe("timestamps", () => {
  it("fills created_at/updated_at on insert and updated_at on update", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const m = await Member.create({
      email: "a@x.io",
      is_admin: false,
      balance: 0,
      tags: [],
    });
    expect(m.created_at).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(m.updated_at).toEqual(m.created_at);

    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    m.email = "b@x.io";
    await m.save();
    expect(m.updated_at).toEqual(new Date("2026-02-01T00:00:00Z"));
    const stored = await Member.findOrFail(m.id);
    expect(stored.created_at).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(stored.updated_at).toEqual(new Date("2026-02-01T00:00:00Z"));

    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    await Member.where("id", m.id).update({ email: "c@x.io" });
    expect((await Member.findOrFail(m.id)).updated_at).toEqual(
      new Date("2026-03-01T00:00:00Z"),
    );
  });

  it("save() with no changes runs no query and keeps updated_at", async () => {
    const m = await Member.create({
      email: "a@x.io",
      is_admin: true,
      balance: 1,
      tags: ["x"],
      settings: { theme: "dark" },
      born_on: new Date("1990-05-17"),
    });
    const loaded = await Member.findOrFail(m.id);
    queries.length = 0;
    await loaded.save();
    expect(queries).toEqual([]);
  });
});

// ─── Casts ───────────────────────────────────────────────────────────────────

describe("casts", () => {
  it("convert values on write and read", async () => {
    await Member.create({
      email: "a@x.io",
      is_admin: true,
      settings: { theme: "dark" },
      born_on: new Date("1990-05-17T00:00:00Z"),
      balance: 12.5,
      tags: ["a", "b"],
    });

    const [stored] = await raw("members");
    expect(stored).toMatchObject({
      is_admin: 1,
      settings: JSON.stringify({ theme: "dark" }),
      born_on: "1990-05-17",
      balance: "12.5", // text column; the "number" cast reads it back as 12.5
      tags: "a,b",
    });
    expect(typeof stored.created_at).toBe("string");

    const m = await Member.where("is_admin", true).firstOrFail(); // boolean bound as 1
    expect(m.is_admin).toBe(true);
    expect(m.settings).toEqual({ theme: "dark" });
    expect(m.born_on).toEqual(new Date("1990-05-17T00:00:00Z"));
    expect(m.balance).toBe(12.5);
    expect(m.tags).toEqual(["a", "b"]);
    expect(m.created_at).toBeInstanceOf(Date);
  });

  it("detects in-place changes to JSON and custom-cast values", async () => {
    const created = await Member.create({
      email: "a@x.io",
      is_admin: false,
      settings: { theme: "dark" },
      balance: 0,
      tags: ["a"],
    });
    const m = await Member.findOrFail(created.id);
    m.settings!.theme = "light";
    m.tags.push("b");
    queries.length = 0;
    await m.save();
    expect(queries).toEqual([
      "update members set settings = ?, tags = ?, updated_at = ? where id = ?",
    ]);
    const again = await Member.findOrFail(created.id);
    expect(again.settings).toEqual({ theme: "light" });
    expect(again.tags).toEqual(["a", "b"]);
  });

  it("number cast reads numeric strings", async () => {
    await Model.db()
      .insertInto("members")
      .values({
        email: "s@x.io",
        balance: "42.75",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      })
      .execute();
    expect((await Member.query().firstOrFail()).balance).toBe(42.75);
  });
});

// ─── Soft deletes ────────────────────────────────────────────────────────────

describe("soft deletes", () => {
  async function two() {
    const a = await Member.create({
      email: "a@x.io",
      is_admin: false,
      balance: 0,
      tags: [],
    });
    const b = await Member.create({
      email: "b@x.io",
      is_admin: false,
      balance: 0,
      tags: [],
    });
    return { a, b };
  }

  it("delete() sets deleted_at and hides the row", async () => {
    const { a } = await two();
    await a.delete();
    expect(a.isTrashed()).toBe(true);
    expect(a.deleted_at).toBeInstanceOf(Date);
    expect(await Member.find(a.id)).toBeUndefined();
    expect(await Member.query().count()).toBe(1);
    expect(await Member.withTrashed().count()).toBe(2);
    expect((await Member.onlyTrashed().get()).map((m) => m.email)).toEqual([
      "a@x.io",
    ]);
    expect(await raw("members")).toHaveLength(2);
  });

  it("restore() and forceDelete()", async () => {
    const { a, b } = await two();
    await a.delete();
    await a.restore();
    expect(a.isTrashed()).toBe(false);
    expect(await Member.query().count()).toBe(2);

    await b.forceDelete();
    expect(await raw("members")).toHaveLength(1);
  });

  it("query delete() soft-deletes; restore() and forceDelete() on queries", async () => {
    await two();
    expect(await Member.where("email", "a@x.io").delete()).toBe(1);
    expect(await Member.query().count()).toBe(1);
    expect(await Member.where("email", "a@x.io").restore()).toBe(1);
    expect(await Member.query().count()).toBe(2);
    expect(await Member.where("email", "b@x.io").forceDelete()).toBe(1);
    expect(await raw("members")).toHaveLength(1);
  });

  it("restore() needs softDeletes", async () => {
    const p = await Permission.create({ name: "x" });
    await expect(p.restore()).rejects.toThrow(/does not use soft deletes/);
  });
});

// ─── belongsToMany ───────────────────────────────────────────────────────────

describe("belongsToMany", () => {
  async function fixture() {
    const ann = await Member.create({
      email: "ann@x.io",
      is_admin: false,
      balance: 0,
      tags: [],
    });
    const bob = await Member.create({
      email: "bob@x.io",
      is_admin: false,
      balance: 0,
      tags: [],
    });
    const admin = await Role.create({ name: "admin" });
    const editor = await Role.create({ name: "editor" });
    const read = await Permission.create({ name: "read" });
    const write = await Permission.create({ name: "write" });
    await admin.related("permissions").attach([read, write]);
    await editor.related("permissions").attach(read.id);
    return { ann, bob, admin, editor, read, write };
  }

  it("attach() writes pivot rows, with pivot columns", async () => {
    const { ann, admin, editor } = await fixture();
    await ann
      .related("roles")
      .attach([admin.id, editor], { granted_by: "root" });
    expect(await raw("member_role")).toEqual([
      { member_id: ann.id, role_id: admin.id, granted_by: "root" },
      { member_id: ann.id, role_id: editor.id, granted_by: "root" },
    ]);
  });

  it("eager loads through the pivot, nested, one query per level", async () => {
    const { ann, bob, admin, editor } = await fixture();
    await ann.related("roles").attach(admin, { granted_by: "root" });
    await ann.related("roles").attach(editor);
    await bob.related("roles").attach(editor);

    queries.length = 0;
    const members = await Member.with("roles.permissions").orderBy("id").get();
    expect(queries).toHaveLength(3);
    expect(queries[1]).toBe(
      "select roles.*, member_role.member_id as __pivot_member_id, member_role.role_id as __pivot_role_id, member_role.granted_by as __pivot_granted_by from roles inner join member_role on member_role.role_id = roles.id where member_role.member_id in (?, ?) and roles.deleted_at is null",
    );
    expect(
      members.map((m) => [
        m.email,
        m.roles.map((r) => [
          r.name,
          r.pivot.granted_by,
          r.permissions.map((p) => p.name).sort(),
        ]),
      ]),
    ).toEqual([
      [
        "ann@x.io",
        [
          ["admin", "root", ["read", "write"]],
          ["editor", null, ["read"]],
        ],
      ],
      ["bob@x.io", [["editor", null, ["read"]]]],
    ]);

    // inverse side, and pivot in JSON
    const editorWithMembers = await Role.with("members")
      .where("name", "editor")
      .firstOrFail();
    expect(editorWithMembers.members.map((m) => m.email)).toEqual([
      "ann@x.io",
      "bob@x.io",
    ]);
    const json = JSON.parse(JSON.stringify(members[0].roles[0]));
    expect(json).toMatchObject({
      name: "admin",
      pivot: { member_id: 1, role_id: 1, granted_by: "root" },
    });
  });

  it("skips soft-deleted related rows", async () => {
    const { ann, admin, editor } = await fixture();
    await ann.related("roles").attach([admin, editor]);
    await editor.delete();
    const m = await Member.with("roles").firstOrFail();
    expect(m.roles.map((r) => r.name)).toEqual(["admin"]);
  });

  it("detach() and sync()", async () => {
    const { ann, admin, editor } = await fixture();
    const viewer = await Role.create({ name: "viewer" });
    await ann.related("roles").attach([admin, editor]);

    expect(await ann.related("roles").detach(editor)).toBe(1);
    expect((await ann.related("roles").get()).map((r) => r.name)).toEqual([
      "admin",
    ]);

    expect(await ann.related("roles").sync([editor.id, viewer.id])).toEqual({
      attached: [editor.id, viewer.id],
      detached: [admin.id],
    });
    expect(
      (await ann.related("roles").get()).map((r) => r.name).sort(),
    ).toEqual(["editor", "viewer"]);

    expect(await ann.related("roles").detach()).toBe(2);
    expect(await ann.related("roles").get()).toEqual([]);
    expect(await ann.related("roles").detach([])).toBe(0);
  });

  it("needs a saved parent", async () => {
    const unsaved = new Member();
    await expect(unsaved.related("roles").attach(1)).rejects.toThrow(
      /Save the Member/,
    );
  });
});

// ─── Compile-time checks (checked by `tsc -p tsconfig.test.json`) ───────────

export async function typeChecks() {
  // timestamp columns are optional in create(); nullable ones too
  await Member.create({ email: "x", is_admin: false, balance: 0, tags: [] });
  // @ts-expect-error email is still required
  await Member.create({ is_admin: false, balance: 0, tags: [] });

  const m = await Member.with("roles.permissions").firstOrFail();
  const grantedBy: string | null = m.roles[0].pivot.granted_by;
  const perm: string = m.roles[0].permissions[0].name;
  const created: Date = m.created_at;
  const admin: boolean = m.is_admin;
  // @ts-expect-error pivot column not declared
  void m.roles[0].pivot.nope;

  await m.related("roles").attach([1, 2], { granted_by: "me" });
  // @ts-expect-error unknown pivot column
  await m.related("roles").attach(1, { nope: 1 });
  const roles = await m.related("roles").get();
  const name: string = roles[0].name;
  // @ts-expect-error only belongsToMany relations
  m.related("email");

  await Member.withTrashed().where("email", "x").restore();
  Member.onlyTrashed().forceDelete();

  return [grantedBy, perm, created, admin, name];
}
