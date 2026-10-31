/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * The ORM's Kysely connection, and the transaction the current async call
 * chain runs in. Only Kysely's types are imported: the app passes its own
 * Kysely instance, so core never loads Kysely itself.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Kysely, Transaction } from "kysely";
import { Container, Token } from "../di";

/** DI token holding the ORM's root Kysely instance. */
export const ORM_CONNECTION = new Token<Kysely<any>>("AVLEON_ORM_CONNECTION");

const currentTransaction = new AsyncLocalStorage<Transaction<any>>();

export function setConnection(db: Kysely<any>) {
  Container.set(ORM_CONNECTION, db);
}

function rootConnection(): Kysely<any> {
  if (!Container.has(ORM_CONNECTION)) {
    throw new Error(
      "[Avleon ORM] No database connection. Call app.useDatabase(kysely) " +
        "(or Model.useConnection(kysely) outside an app) first.",
    );
  }
  return Container.get(ORM_CONNECTION);
}

/** The transaction this call chain runs in, else the root connection. */
export function getConnection(): Kysely<any> {
  return currentTransaction.getStore() ?? rootConnection();
}

/**
 * Run `fn` in a transaction. Every model query made inside it, however deep
 * in the call chain, uses the transaction. A nested call joins the outer
 * transaction. The transaction commits when `fn` resolves and rolls back if
 * it throws.
 */
export function runInTransaction<T>(
  fn: (trx: Transaction<any>) => Promise<T>,
): Promise<T> {
  const outer = currentTransaction.getStore();
  if (outer) return fn(outer);
  return rootConnection()
    .transaction()
    .execute((trx) => currentTransaction.run(trx, () => fn(trx)));
}
