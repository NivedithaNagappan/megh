/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Internal: model instances built from rows, and what they looked like when
 * loaded (for `save()` to write only changed columns).
 */
import { castFromDatabase, castToDatabase, sameValue } from "./casts";
import { getConnection } from "./connection";
import { getRelations } from "./relations";
import type { ModelClass } from "./types";

interface InstanceState {
  /** The row exists in the database. */
  exists: boolean;
  /** Column values as last read or written. */
  original: Record<string, unknown>;
}

const states = new WeakMap<object, InstanceState>();

export function tableOf(cls: ModelClass): string {
  if (!cls.table) {
    throw new Error(
      `[Megh ORM] ${cls.name} has no table. Add \`static readonly table = "..."\`.`,
    );
  }
  return cls.table;
}

/** A model instance holding `row` (as read from the database), marked as persisted. */
export function hydrate<M>(
  cls: ModelClass<M>,
  row: Record<string, unknown>,
  /** `row` is already in model form (e.g. from {@link insertRow}). */
  cast = true,
): M {
  const instance: any = new cls();
  // Drop relation markers and fields left `undefined` by class field
  // initialization, so unloaded relations and unselected columns are absent.
  for (const key of Object.keys(instance)) {
    if (instance[key] === undefined || getRelations(cls).has(key)) {
      delete instance[key];
    }
  }
  const values = cast ? castFromDatabase(cls, row) : row;
  Object.assign(instance, values);
  markPersisted(instance, values);
  return instance;
}

function snapshot(values: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(values);
  } catch {
    return { ...values };
  }
}

export function getState(instance: object): InstanceState {
  return states.get(instance) ?? { exists: false, original: {} };
}

/** Record `values` (model form) as the instance's stored state. */
export function markPersisted(
  instance: object,
  values: Record<string, unknown>,
) {
  states.set(instance, { exists: true, original: snapshot(values) });
}

export function markDeleted(instance: object) {
  const state = getState(instance);
  states.set(instance, { ...state, exists: false });
}

/** The instance's column values: own fields that are not relations. */
export function columnValues(instance: object): Record<string, unknown> {
  const relations = getRelations(instance.constructor as ModelClass);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(instance)) {
    if (value !== undefined && !relations.has(key)) out[key] = value;
  }
  return out;
}

/** Columns whose value differs from when the instance was loaded or saved. */
export function changedValues(instance: object): Record<string, unknown> {
  const { original } = getState(instance);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(columnValues(instance))) {
    if (!(key in original) || !sameValue(value, original[key]))
      out[key] = value;
  }
  return out;
}

/** `values` plus `created_at`/`updated_at` when the model has timestamps. */
export function withTimestamps(
  cls: ModelClass,
  values: Record<string, unknown>,
  on: "insert" | "update",
): Record<string, unknown> {
  if (!cls.timestamps) return values;
  const now = new Date();
  const out = { ...values };
  if (on === "insert") out[cls.createdAt] ??= now;
  out[cls.updatedAt] ??= now;
  return out;
}

/**
 * Insert `values` (model form) into the model's table and return the stored
 * row, cast to model form. Fills timestamps. Uses `RETURNING` where the
 * dialect has it (Postgres, SQLite, MSSQL) and reads the row back by its id
 * otherwise (MySQL).
 */
export async function insertRow(
  cls: ModelClass,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const db = getConnection();
  const table = tableOf(cls);
  const data = castToDatabase(cls, withTimestamps(cls, values, "insert"), db);
  if (db.getExecutor().adapter.supportsReturning) {
    const row = await db
      .insertInto(table)
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
    return castFromDatabase(cls, row);
  }
  const result = await db
    .insertInto(table)
    .values(data)
    .executeTakeFirstOrThrow();
  const id = data[cls.primaryKey] ?? Number(result.insertId);
  const row = await db
    .selectFrom(table)
    .selectAll()
    .where(cls.primaryKey, "=", id)
    .executeTakeFirstOrThrow();
  return castFromDatabase(cls, row);
}

/** Update the row with primary key `id`. `values` are in model form. */
export async function updateRow(
  cls: ModelClass,
  id: unknown,
  values: Record<string, unknown>,
): Promise<void> {
  const db = getConnection();
  await db
    .updateTable(tableOf(cls))
    .set(castToDatabase(cls, values, db))
    .where(cls.primaryKey, "=", id)
    .execute();
}
