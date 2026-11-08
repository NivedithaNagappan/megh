import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DummyDriver,
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { DB } from "./db";
import { Model } from "./index";

class Member extends Model {
  static readonly table = "members";

  id: number;
  name: string;
}

// A connection that runs nothing and records the SQL it is sent.
function fakeConnection(dialect: "mssql" | "postgres") {
  const [Adapter, Compiler, Introspector] =
    dialect === "mssql"
      ? ([MssqlAdapter, MssqlQueryCompiler, MssqlIntrospector] as const)
      : ([
          PostgresAdapter,
          PostgresQueryCompiler,
          PostgresIntrospector,
        ] as const);
  const statements: string[] = [];
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new Adapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (k) => new Introspector(k),
      createQueryCompiler: () => new Compiler(),
    },
    log: (event) => {
      // Identifier quotes stripped, so expectations read as plain SQL.
      if (event.level === "query")
        statements.push(event.query.sql.replace(/["[\]]/g, ""));
    },
  });
  Model.useConnection(db);
  return statements;
}

describe("limit and offset on SQL Server", () => {
  let sql: string[];

  beforeEach(() => {
    sql = fakeConnection("mssql");
  });

  it("uses top() for a limit on DB.table()", async () => {
    await DB.table("members").orderBy("name").limit(10).get();
    expect(sql[0]).toBe("select top(10) * from members order by name asc");
  });

  it("uses top(1) for first()", async () => {
    await DB.table("members").where("id", 3).first();
    expect(sql[0]).toBe("select top(1) * from members where id = @1");
  });

  it("uses offset … fetch for limit plus offset", async () => {
    await DB.table("members").orderBy("name").limit(10).offset(20).get();
    expect(sql[0]).toBe(
      "select * from members order by name asc offset @1 rows fetch next @2 rows only",
    );
  });

  it("adds order by (select null) when an offset has no ordering", async () => {
    await DB.table("members").offset(5).get();
    expect(sql[0]).toBe(
      "select * from members order by (select null) offset @1 rows",
    );
  });

  it("pages model queries", async () => {
    await Member.query().limit(10).get();
    await Member.query().orderBy("name").limit(10).offset(20).get();
    await Member.find(1);
    expect(sql).toEqual([
      "select top(10) * from members",
      "select * from members order by name asc offset @1 rows fetch next @2 rows only",
      "select top(1) * from members where id = @1",
    ]);
  });

  it("rejects a limit that is not a whole number", async () => {
    await expect(DB.table("members").limit(1.5).get()).rejects.toThrow(
      /whole number/,
    );
  });
});

describe("limit and offset elsewhere", () => {
  it("keeps limit … offset", async () => {
    const sql = fakeConnection("postgres");
    await DB.table("members").limit(10).offset(20).get();
    await Member.query().offset(5).get();
    expect(sql).toEqual([
      "select * from members limit $1 offset $2",
      "select * from members limit $1 offset $2",
    ]);
  });
});
