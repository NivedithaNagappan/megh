import type { MigrationColumn, MigrationTable } from "./migration-schema";
import { renderStub } from "../utils/stubs";

/**
 * Renders a Megh ORM model (`class X extends Model`), with its columns taken
 * from the table's migrations when there are any.
 */

const IRREGULAR: Record<string, string> = {
  person: "people",
  child: "children",
  man: "men",
  woman: "women",
  mouse: "mice",
  datum: "data",
};

/** Plural of a snake_case name, inflecting the last word: `blog_post` → `blog_posts`. */
export function pluralize(snake: string): string {
  const parts = snake.split("_");
  const last = parts.pop() ?? "";
  let plural: string;
  if (IRREGULAR[last]) plural = IRREGULAR[last];
  else if (/[^aeiou]y$/.test(last)) plural = last.slice(0, -1) + "ies";
  else if (/(s|x|z|ch|sh)$/.test(last)) plural = last + "es";
  else plural = last + "s";
  return [...parts, plural].join("_");
}

const IRREGULAR_SINGULAR: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR).map(([singular, plural]) => [plural, singular]),
);

/**
 * Singular of a snake_case name, inflecting the last word: `blog_posts` → `blog_post`.
 * Leaves already-singular words alone (including `status`, which must not become `statu`).
 * Only accepts a candidate when `pluralize(candidate)` rebuilds `snake`.
 */
export function singularize(snake: string): string {
  const parts = snake.split("_");
  const last = parts.pop() ?? "";
  const take = (candidate: string) => (pluralize(candidate) === last ? candidate : null);
  let singular: string | null = null;
  if (IRREGULAR_SINGULAR[last]) singular = IRREGULAR_SINGULAR[last];
  else if (/ies$/.test(last) && last.length > 3) singular = take(last.slice(0, -3) + "y");
  else if (/(?:s|x|z|ch|sh)es$/.test(last)) singular = take(last.slice(0, -2));
  if (!singular && /s$/.test(last) && !/(?:us|ss|is|ous)$/.test(last)) {
    singular = take(last.slice(0, -1));
  }
  return [...parts, singular ?? last].join("_");
}

/** Plural form for a route segment, even when `snake` is already plural. */
export function pluralRoute(snake: string): string {
  return pluralize(singularize(snake));
}

type Cast = "boolean" | "number" | "json" | "date" | "datetime";

interface FieldType {
  ts: string;
  cast?: Cast;
}

/** TypeScript type (and cast) for a column's SQL data type. */
export function fieldType(sqlType: string): FieldType {
  const base = sqlType.replace(/\(.*$/, "").trim();
  if (/^(tinyint|bool|boolean|bit)$/.test(base)) {
    // MySQL tinyint(1) and SQLite integers hold booleans as 0/1.
    if (base !== "tinyint" || /^tinyint\(1\)/.test(sqlType)) return { ts: "boolean", cast: "boolean" };
  }
  if (/^(int\d?|integer|smallint|mediumint|tinyint|bigint|serial\d?|smallserial|bigserial)$/.test(base)) {
    // Postgres returns bigint as a string; the cast turns it back into a number.
    return /big/.test(base) ? { ts: "number", cast: "number" } : { ts: "number" };
  }
  if (/^(real|float\d?|double|double precision|decimal|numeric|money)$/.test(base)) {
    return { ts: "number", cast: "number" };
  }
  if (base === "date") return { ts: "Date", cast: "date" };
  if (/^(timestamp|timestamptz|timestamp with(out)? time zone|datetime|datetime2|datetimeoffset|smalldatetime)$/.test(base)) {
    return { ts: "Date", cast: "datetime" };
  }
  if (/^(text|tinytext|mediumtext|longtext|varchar|char|character|character varying|nvarchar|nchar|ntext|uuid|citext|enum|inet|cidr|macaddr|time|timetz|time with(out)? time zone|interval)$/.test(base)) {
    return { ts: "string" };
  }
  if (/^jsonb?$/.test(base)) return { ts: "Record<string, unknown>", cast: "json" };
  if (/^(blob|bytea|binary|varbinary|longblob|mediumblob|tinyblob|image)$/.test(base)) {
    return { ts: "Buffer" };
  }
  return { ts: "unknown" };
}

/** Columns with their own decorator, filled in by the ORM. */
const TIMESTAMP_DECORATORS: Record<string, string> = {
  created_at: "CreatedAt",
  updated_at: "UpdatedAt",
  deleted_at: "DeletedAt",
};

/** Column type for a cast, so the column converts its values. */
const CAST_TYPES: Partial<Record<Cast, string>> = {
  boolean: "boolean",
  json: "json",
  date: "date",
  datetime: "datetime",
};

/** A model class for `table`, declaring the columns its migrations create. */
export function renderOrmModel(model: string, table: MigrationTable): string {
  const imports = new Set(["Model", "Table"]);
  const fields = table.columns.map((column) => {
    const { decorators, field } = renderField(column);
    for (const d of decorators) imports.add(d.match(/^@(\w+)/)![1]);
    return `${decorators.join(" ")} ${field}`;
  });

  return renderStub("models/orm-model.stub", {
    imports: [...imports].sort().join(", "),
    Model: model,
    table: q(table.name),
    source: table.createdIn,
    fields: fields.join("\n  "),
  });
}

/** The decorators and declaration of one column. */
function renderField(column: MigrationColumn): { decorators: string[]; field: string } {
  const { ts, cast } = fieldType(column.type);
  const name = property(column.name);

  const timestamp = TIMESTAMP_DECORATORS[column.name];
  if (timestamp && ts === "Date") {
    const type = timestamp === "DeletedAt" ? "Date | null" : "Date";
    return { decorators: [`@${timestamp}()`], field: `${name}?: ${type};` };
  }

  const decorators: string[] = [];
  if (column.primaryKey) decorators.push("@PrimaryKey()");
  if (column.autoIncrement) decorators.push("@AutoIncrement()");

  const options: string[] = [];
  if (!column.notNull) options.push("nullable: true");
  if (cast && CAST_TYPES[cast]) options.push(`type: ${q(CAST_TYPES[cast]!)}`);
  else if (cast === "number") options.push(`cast: "number"`); // e.g. Postgres bigint, read as text
  // Key columns are already declared by @PrimaryKey / @AutoIncrement.
  if (options.length > 0 || decorators.length === 0) {
    decorators.push(options.length ? `@Column({ ${options.join(", ")} })` : "@Column()");
  }

  // `?`: the database fills it in (auto-increment or a default), so create() may leave it out.
  const mark = column.generated ? "?" : "!";
  return { decorators, field: `${name}${mark}: ${column.notNull ? ts : `${ts} | null`};` };
}

/** A model class for a table with no migration yet: placeholder columns. */
export function renderBlankOrmModel(model: string, table: string): string {
  return renderStub("models/orm-model-blank.stub", { Model: model, table: q(table) });
}

const q = (value: string) => JSON.stringify(value);

/** A property key: bare when it is a valid identifier, quoted otherwise. */
const property = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : q(name));
