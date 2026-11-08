/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Internal: adding a row limit and offset to a select in the dialect's syntax.
 *
 * - Postgres, MySQL and SQLite use `limit … offset …`. MySQL and SQLite need a
 *   limit before an offset, so an offset alone gets the largest safe limit.
 * - SQL Server has no `limit`. A limit alone becomes `select top(n)`. An
 *   offset becomes `offset n rows fetch next m rows only`, which needs an
 *   `order by`, so `order by (select null)` is added when the query has none.
 */
import type { Kysely } from "kysely";
import { usesAdapter } from "./casts";
import { kysely } from "./engine";

export interface Paging {
  limit?: number;
  offset?: number;
  /** Whether the query already has an `order by`. */
  ordered: boolean;
}

export function applyPaging(
  db: Kysely<any>,
  qb: any,
  { limit, offset, ordered }: Paging,
): any {
  if (usesAdapter(db, "MssqlAdapter")) {
    if (offset === undefined) {
      // top(n) is inlined into the SQL, so only accept a whole number.
      return limit === undefined ? qb : qb.top(wholeNumber(limit));
    }
    if (!ordered) qb = qb.orderBy(kysely().sql`(select null)`);
    qb = qb.offset(offset);
    return limit === undefined ? qb : qb.fetch(limit);
  }

  if (limit !== undefined) qb = qb.limit(limit);
  if (offset !== undefined) {
    if (limit === undefined) qb = qb.limit(Number.MAX_SAFE_INTEGER);
    qb = qb.offset(offset);
  }
  return qb;
}

function wholeNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`The limit must be a whole number, got ${value}.`);
  }
  return value;
}
