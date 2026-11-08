import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { NotFoundException } from "../common/exceptions";
import { DB } from "./db";
import { Model } from "./model";

let db: Kysely<any>;

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  await sql`create table teams (id integer primary key autoincrement, name text not null)`.execute(
    db,
  );
  await sql`create table members (id integer primary key autoincrement, team_id integer, name text not null, age integer, active integer not null default 1, joined_at text, meta text)`.execute(
    db,
  );
  Model.useConnection(db);
});

beforeEach(async () => {
  await sql`delete from members`.execute(db);
  await sql`delete from teams`.execute(db);
  await sql`delete from sqlite_sequence`.execute(db);
  await DB.table("teams").insert([{ name: "core" }, { name: "docs" }]);
  await DB.table("members").insert([
    { team_id: 1, name: "Ann", age: 31 },
    { team_id: 1, name: "Bob", age: 25, active: false },
    { team_id: 2, name: "Cid", age: 40 },
    { team_id: null, name: "Dee", age: null },
  ]);
});

afterAll(async () => {
  await db.destroy();
});

const names = (rows: Record<string, any>[]) => rows.map((r) => r.name);

describe("DB.table reads", () => {
  it("filters with where, operators, objects and null", async () => {
    expect(names(await DB.table("members").where("team_id", 1).get())).toEqual([
      "Ann",
      "Bob",
    ]);
    expect(
      names(await DB.table("members").where("age", ">", 30).get()),
    ).toEqual(["Ann", "Cid"]);
    expect(
      names(
        await DB.table("members").where({ team_id: 1, active: true }).get(),
      ),
    ).toEqual(["Ann"]);
    expect(
      names(await DB.table("members").where("team_id", null).get()),
    ).toEqual(["Dee"]);
    expect(
      names(await DB.table("members").where("name", "like", "%e%").get()),
    ).toEqual(["Dee"]);
  });

  it("gives and precedence over or, and groups conditions", async () => {
    // team_id = 2 or (team_id = 1 and age < 30)
    const q = DB.table("members")
      .where("team_id", 2)
      .orWhere("team_id", 1)
      .where("age", "<", 30);
    expect(names(await q.get())).toEqual(["Bob", "Cid"]);
    expect(q.toSQL().sql.replace(/"/g, "")).toBe(
      "select * from members where (team_id = ? or (team_id = ? and age < ?))",
    );

    const grouped = DB.table("members")
      .where("active", true)
      .where((g) => g.where("age", ">", 35).orWhereNull("age"));
    expect(names(await grouped.get())).toEqual(["Cid", "Dee"]);
  });

  it("whereIn, whereNotIn, whereBetween, whereNotNull, whereColumn and whereRaw", async () => {
    expect(
      names(await DB.table("members").whereIn("name", ["Ann", "Cid"]).get()),
    ).toEqual(["Ann", "Cid"]);
    expect(await DB.table("members").whereIn("name", []).count()).toBe(0);
    expect(await DB.table("members").whereNotIn("name", []).count()).toBe(4);
    expect(
      names(await DB.table("members").whereBetween("age", [25, 31]).get()),
    ).toEqual(["Ann", "Bob"]);
    expect(
      names(
        await DB.table("members")
          .whereNotNull("team_id")
          .whereNotIn("name", ["Bob"])
          .get(),
      ),
    ).toEqual(["Ann", "Cid"]);
    expect(
      await DB.table("members").whereColumn("id", "<", "age").count(),
    ).toBe(3);
    expect(
      names(
        await DB.table("members").whereRaw("lower(name) = ?", ["ann"]).get(),
      ),
    ).toEqual(["Ann"]);
  });

  it("selects, joins, orders, groups and limits", async () => {
    const rows = await DB.table("members")
      .join("teams", "teams.id", "members.team_id")
      .select("members.name", "teams.name as team")
      .orderBy("members.name", "desc")
      .limit(2)
      .get();
    expect(rows).toEqual([
      { name: "Cid", team: "docs" },
      { name: "Bob", team: "core" },
    ]);

    const left = await DB.table("members")
      .leftJoin("teams", "teams.id", "members.team_id")
      .select("teams.name")
      .get();
    expect(left).toHaveLength(4);

    const perTeam = await DB.table("members")
      .select("team_id")
      .selectRaw("count(*) as members")
      .whereNotNull("team_id")
      .groupBy("team_id")
      .having("team_id", ">=", 1)
      .orderBy("team_id")
      .get();
    expect(perTeam).toEqual([
      { team_id: 1, members: 2 },
      { team_id: 2, members: 1 },
    ]);

    expect(
      names(await DB.table("members").orderBy("id").offset(1).take(2).get()),
    ).toEqual(["Bob", "Cid"]);
    expect(
      names(await DB.table("members").orderBy("id").forPage(2, 3).get()),
    ).toEqual(["Dee"]);
  });

  it("first, firstOrFail, value, pluck and exists", async () => {
    expect((await DB.table("members").where("name", "Bob").first())?.age).toBe(
      25,
    );
    expect(
      await DB.table("members").where("name", "Zed").first(),
    ).toBeUndefined();
    await expect(
      DB.table("members").where("name", "Zed").firstOrFail(),
    ).rejects.toThrow(NotFoundException);
    expect(await DB.table("members").where("name", "Cid").value("age")).toBe(
      40,
    );
    expect(await DB.table("members").orderBy("id").pluck("name")).toEqual([
      "Ann",
      "Bob",
      "Cid",
      "Dee",
    ]);
    expect(await DB.table("members").where("age", ">", 100).exists()).toBe(
      false,
    );
    expect(await DB.table("members").where("age", ">", 100).doesntExist()).toBe(
      true,
    );
  });

  it("aggregates, including grouped and distinct queries", async () => {
    const members = DB.table("members");
    expect(await members.count()).toBe(4);
    expect(await members.count("age")).toBe(3);
    expect(await members.sum("age")).toBe(96);
    expect(await members.avg("age")).toBe(32);
    expect(await members.min("age")).toBe(25);
    expect(await members.max("age")).toBe(40);
    expect(
      await DB.table("members").where("age", ">", 100).avg("age"),
    ).toBeNull();
    expect(
      await DB.table("members")
        .select("team_id")
        .whereNotNull("team_id")
        .groupBy("team_id")
        .count(),
    ).toBe(2);
    expect(await DB.table("members").select("team_id").distinct().count()).toBe(
      3,
    );
  });

  it("paginates", async () => {
    const page = await DB.table("members")
      .orderBy("id")
      .paginate({ page: 2, perPage: 3 });
    expect(names(page.data)).toEqual(["Dee"]);
    expect(page.meta).toMatchObject({
      total: 4,
      page: 2,
      perPage: 3,
      lastPage: 2,
      prev: 1,
      next: null,
    });
  });

  it("leaves the original query alone when cloned", async () => {
    const base = DB.table("members").where("team_id", 1);
    const older = base.clone().where("age", ">", 30);
    expect(await older.count()).toBe(1);
    expect(await base.count()).toBe(2);
  });
});

describe("DB.table writes", () => {
  it("inserts, returning the new id", async () => {
    const id = await DB.table("teams").insertGetId({ name: "ops" });
    expect(id).toBe(3);
    await DB.table("members").insert({
      team_id: id,
      name: "Eve",
      joined_at: new Date("2026-01-02T03:04:05.000Z"),
      meta: { tags: ["x"] },
    });
    const eve = await DB.table("members").where("name", "Eve").firstOrFail();
    expect(eve).toMatchObject({
      team_id: 3,
      joined_at: "2026-01-02T03:04:05.000Z",
      meta: JSON.stringify({ tags: ["x"] }),
    });
  });

  it("updates, increments and deletes, returning row counts", async () => {
    expect(
      await DB.table("members").where("team_id", 1).update({ active: false }),
    ).toBe(2);
    expect(await DB.table("members").where("active", false).count()).toBe(2);
    expect(
      await DB.table("members").where("name", "Ann").increment("age", 2),
    ).toBe(1);
    expect(
      await DB.table("members")
        .where("name", "Ann")
        .decrement("age", 1, { active: true }),
    ).toBe(1);
    expect(
      await DB.table("members").where("name", "Ann").first(),
    ).toMatchObject({ age: 32, active: 1 });
    expect(await DB.table("members").whereNull("team_id").delete()).toBe(1);
    expect(await DB.table("members").count()).toBe(3);
  });
});

describe("DB raw SQL and transactions", () => {
  it("runs SQL with ? bindings", async () => {
    const rows = await DB.select<{ name: string }>(
      "select name from members where age > ? order by name",
      [30],
    );
    expect(names(rows)).toEqual(["Ann", "Cid"]);
    expect(
      await DB.statement("update members set age = ? where name = ?", [
        50,
        "Dee",
      ]),
    ).toBe(1);
    expect(() => DB.select("select ?", [])).rejects.toThrow(
      /1 "\?" placeholders but 0 values/,
    );
  });

  it("rolls back a transaction that throws", async () => {
    await expect(
      DB.transaction(async () => {
        await DB.table("members").where("name", "Ann").delete();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await DB.table("members").where("name", "Ann").exists()).toBe(true);

    await DB.transaction(async () => {
      await DB.table("members").where("name", "Ann").delete();
    });
    expect(await DB.table("members").where("name", "Ann").exists()).toBe(false);
  });

  it("rejects unknown operators", () => {
    expect(() => DB.table("members").where("age", "=>" as any, 1)).toThrow(
      /Unknown operator "=>"/,
    );
  });
});
