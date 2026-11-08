import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DatabaseConnection,
  type Driver,
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
} from "kysely";
import { DB } from "./db";
import { Model } from "./index";

class Role extends Model {
  static readonly table = "roles";
  static readonly timestamps = false;

  id: number;
  name: string;
}

// A SQL Server connection that runs nothing, records the SQL it is sent and
// answers every query with one row. Like the real driver, it gives no insertId.
// The SQL is kept exactly as sent: `output "inserted"."*"` would be a broken column.
function fakeSqlServer(row: Record<string, unknown>) {
  const statements: string[] = [];
  const connection: DatabaseConnection = {
    async executeQuery(query) {
      statements.push(query.sql);
      return { rows: [row] as any[] };
    },
    async *streamQuery() {},
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() {
      return connection;
    },
    async beginTransaction() {},
    async commitTransaction() {},
    async rollbackTransaction() {},
    async releaseConnection() {},
    async destroy() {},
  };
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new MssqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MssqlIntrospector(k),
      createQueryCompiler: () => new MssqlQueryCompiler(),
    },
  });
  Model.useConnection(db);
  return statements;
}

describe("inserts on SQL Server", () => {
  let sql: string[];

  beforeEach(() => {
    sql = fakeSqlServer({ id: 7, name: "Admin" });
  });

  it("returns the created model through output inserted.*", async () => {
    const role = await Role.create({ name: "Admin" });
    expect(sql).toEqual([
      "insert into \"roles\" (\"name\") output \"inserted\".* values (@1)",
    ]);
    expect(role.id).toBe(7);
    expect(role.name).toBe("Admin");
  });

  it("returns the new id from insertGetId() through output", async () => {
    const id = await DB.table("roles").insertGetId({ name: "Admin" });
    expect(sql).toEqual([
      "insert into \"roles\" (\"name\") output \"inserted\".\"id\" values (@1)",
    ]);
    expect(id).toBe(7);
  });
});
