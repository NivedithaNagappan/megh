/**
 * Property names on models, column names in the database.
 *
 * A decorated column's name comes from `@Column({ name })`, else from the
 * naming strategy: `"preserve"` (the default) uses the property name,
 * `"snake_case"` turns `createdAt` into `created_at`. Models without column
 * decorators always use their property names.
 *
 * The rest of the ORM works in property names and converts at the edges:
 * values on their way into SQL, rows on their way out, and column names in
 * queries.
 */
import { getModelMetadata } from "./decorators";
import { snakeCase } from "./relations";

export type NamingStrategy = "preserve" | "snake_case";

let strategy: NamingStrategy = "preserve";

/**
 * How decorated properties without an explicit `name` map to columns.
 * `app.useMeghORM({ naming })` sets it; call it directly in scripts and tests.
 */
export function setNamingStrategy(value: NamingStrategy): void {
  if (value !== "preserve" && value !== "snake_case") {
    throw new Error(
      `[Megh ORM] Unknown naming strategy "${value}". Use "preserve" or "snake_case".`,
    );
  }
  strategy = value;
}

export function getNamingStrategy(): NamingStrategy {
  return strategy;
}

interface NameMap {
  toColumn: Map<string, string>;
  toProperty: Map<string, string>;
}

const EMPTY: NameMap = { toColumn: new Map(), toProperty: new Map() };
const cache = new WeakMap<
  Function,
  { strategy: NamingStrategy; map: NameMap }
>();

/** The property ↔ column pairs that differ, for one model class. */
function nameMap(cls: Function): NameMap {
  const cached = cache.get(cls);
  if (cached && cached.strategy === strategy) return cached.map;

  const columns = getModelMetadata(cls)?.columns;
  let map = EMPTY;
  if (columns && columns.size > 0) {
    map = { toColumn: new Map(), toProperty: new Map() };
    for (const column of columns.values()) {
      const name =
        column.name ??
        (strategy === "snake_case"
          ? snakeCase(column.property)
          : column.property);
      if (name === column.property) continue;
      map.toColumn.set(column.property, name);
      map.toProperty.set(name, column.property);
    }
  }
  cache.set(cls, { strategy, map });
  return map;
}

/**
 * The column for a property of `cls`. Anything else (a column name already,
 * a qualified `table.column`) is returned as is, so relation keys may be
 * given either way.
 */
export function columnName(cls: Function, name: string): string {
  return nameMap(cls).toColumn.get(name) ?? name;
}

/** The property for a column of `cls`; names that aren't mapped are returned as is. */
export function propertyName(cls: Function, name: string): string {
  return nameMap(cls).toProperty.get(name) ?? name;
}

/** `values` keyed by column instead of property. */
export function toColumns(
  cls: Function,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const { toColumn } = nameMap(cls);
  if (toColumn.size === 0) return values;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    out[toColumn.get(key) ?? key] = value;
  }
  return out;
}

/** A database row keyed by property instead of column. */
export function toProperties(
  cls: Function,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const { toProperty } = nameMap(cls);
  if (toProperty.size === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[toProperty.get(key) ?? key] = value;
  }
  return out;
}
