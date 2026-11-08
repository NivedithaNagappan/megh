import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  type DatabaseConnection,
  type Driver,
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  sql,
} from "kysely";
import { withSqlServerErrors } from "./connect";

// A SQL Server connection whose queries fail with `queryError`, and whose
// rollback fails with `rollbackError` (as it does after SQL Server has
// aborted the transaction itself).
function fakeSqlServer(queryError: unknown, rollbackError?: unknown) {
  const connection: DatabaseConnection = {
    async executeQuery() {
      throw queryError;
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
    async rollbackTransaction() {
      if (rollbackError) throw rollbackError;
    },
    async releaseConnection() {},
    async destroy() {},
  };
  return new Kysely<any>({
    dialect: withSqlServerErrors({
      createAdapter: () => new MssqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MssqlIntrospector(k),
      createQueryCompiler: () => new MssqlQueryCompiler(),
    }),
  });
}

const requestError = (number: number, message: string) =>
  Object.assign(new Error(message), { name: "RequestError", number });

const aborted = () =>
  requestError(
    3903,
    "The ROLLBACK TRANSACTION request has no corresponding BEGIN TRANSACTION.",
  );

describe("SQL Server errors", () => {
  it("report the error that aborted a transaction, not the failed rollback", async () => {
    const cause = requestError(
      547,
      "The ALTER TABLE statement conflicted with the FOREIGN KEY constraint.",
    );
    const db = fakeSqlServer(cause, aborted());
    await expect(
      db
        .transaction()
        .execute((trx) => sql`alter table users add constraint x`.execute(trx)),
    ).rejects.toBe(cause);
  });

  it("still report other rollback failures", async () => {
    const lost = requestError(0, "Connection lost");
    const db = fakeSqlServer(requestError(1, "query failed"), lost);
    await expect(
      db.transaction().execute((trx) => sql`select 1`.execute(trx)),
    ).rejects.toBe(lost);
  });

  it("merge several messages for one statement into one Error", async () => {
    // Kysely rejects with the AggregateError's `errors` array.
    const errors = [
      requestError(
        1767,
        "Foreign key 'users_account_id_foreign' references invalid table 'accounts'.",
      ),
      requestError(
        1750,
        "Could not create constraint or index. See previous errors.",
      ),
    ];
    const db = fakeSqlServer(errors, aborted());
    const error = await db
      .transaction()
      .execute((trx) => sql`alter table users add constraint x`.execute(trx))
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "Foreign key 'users_account_id_foreign' references invalid table 'accounts'. " +
        "Could not create constraint or index. See previous errors.",
    );
    expect(error).toMatchObject({ name: "RequestError", number: 1767, errors });
  });
});
