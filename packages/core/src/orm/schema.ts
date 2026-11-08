/**
 * Megh's schema builder, for migrations:
 *
 * ```ts
 * export default defineMigration({
 *   async up(schema) {
 *     await schema.create("users", (table) => {
 *       table.id();
 *       table.string("email").unique();
 *       table.foreignId("team_id").constrained().cascadeOnDelete();
 *       table.timestamps();
 *     });
 *   },
 *   async down(schema) {
 *     await schema.drop("users");
 *   },
 * });
 * ```
 *
 * Each column type maps to the right SQL type for the database, and
 * statements a database can't run as written (foreign keys on MySQL, renames
 * on SQL Server, unique columns added to SQLite tables) are issued the way
 * that database needs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Kysely's create/alter
   builders change type with every call; the chains here are built up in loops. */
import type { Kysely } from "kysely";
import { usesAdapter } from "./casts";
import type { ColumnType } from "./decorators";
import { kysely } from "./engine";
import { pluralize } from "./decorators";

export type SchemaDialect = "postgres" | "mysql" | "sqlite" | "mssql";

export type ReferentialAction =
  "cascade" | "set null" | "restrict" | "no action" | "set default";

/** Which database `db` talks to, from its Kysely adapter. */
export function dialectOf(db: Kysely<any>): SchemaDialect {
  if (usesAdapter(db, "PostgresAdapter")) return "postgres";
  if (usesAdapter(db, "MysqlAdapter")) return "mysql";
  if (usesAdapter(db, "MssqlAdapter")) return "mssql";
  if (usesAdapter(db, "SqliteAdapter")) return "sqlite";
  throw new Error(
    "[Megh ORM] The schema builder supports PostgreSQL, MySQL, SQLite and SQL Server.",
  );
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(`[Megh ORM] ${message}`);
    this.name = "SchemaError";
  }
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

type SchemaColumnType = ColumnType | "increments" | "bigIncrements";

interface ColumnState {
  nullable: boolean;
  unique: boolean;
  primary: boolean;
  autoIncrement: boolean;
  default?: { value: unknown } | { current: true };
  references?: { table: string; column: string };
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}

/** A column being added. Columns are NOT NULL unless marked `nullable()`. */
export class ColumnDefinition {
  /** @internal */
  readonly state: ColumnState = {
    nullable: false,
    unique: false,
    primary: false,
    autoIncrement: false,
  };

  constructor(
    readonly name: string,
    readonly type: SchemaColumnType,
    /** @internal */
    readonly params: {
      length?: number;
      precision?: number;
      scale?: number;
    } = {},
  ) {}

  /** Allow NULL. */
  nullable(value = true): this {
    this.state.nullable = value;
    return this;
  }

  unique(): this {
    this.state.unique = true;
    return this;
  }

  primary(): this {
    this.state.primary = true;
    return this;
  }

  /** The value the database fills in when an insert leaves the column out. */
  default(value: unknown): this {
    this.state.default = { value };
    return this;
  }

  /** Default to the current time. */
  useCurrent(): this {
    this.state.default = { current: true };
    return this;
  }

  /** A column the database numbers itself. */
  autoIncrement(): this {
    this.state.autoIncrement = true;
    return this;
  }

  /**
   * A foreign key to `"table.column"`, or to `"table"` (its `id`).
   */
  references(target: string): this {
    const [table, column = "id"] = target.split(".");
    this.state.references = { table, column };
    return this;
  }

  /**
   * A foreign key to `table` (default: from the column name, `user_id` →
   * `users`) and its `column` (default `id`).
   */
  constrained(table?: string, column = "id"): this {
    const target = table ?? pluralize(this.name.replace(/_id$/, ""));
    this.state.references = { table: target, column };
    return this;
  }

  onDelete(action: ReferentialAction): this {
    this.state.onDelete = action;
    return this;
  }

  onUpdate(action: ReferentialAction): this {
    this.state.onUpdate = action;
    return this;
  }

  /** Delete this row when the referenced row is deleted. */
  cascadeOnDelete(): this {
    return this.onDelete("cascade");
  }

  /** Set this column to NULL when the referenced row is deleted. */
  nullOnDelete(): this {
    this.state.nullable = true;
    return this.onDelete("set null");
  }
}

/** A foreign key on existing columns: `table.foreign("user_id").references("users.id")`. */
export class ForeignKeyDefinition {
  /** @internal */
  target?: { table: string; column: string };
  /** @internal */
  deleteAction?: ReferentialAction;
  /** @internal */
  updateAction?: ReferentialAction;

  constructor(
    readonly columns: string[],
    readonly name: string,
  ) {}

  references(target: string): this {
    const [table, column = "id"] = target.split(".");
    this.target = { table, column };
    return this;
  }

  onDelete(action: ReferentialAction): this {
    this.deleteAction = action;
    return this;
  }

  onUpdate(action: ReferentialAction): this {
    this.updateAction = action;
    return this;
  }

  cascadeOnDelete(): this {
    return this.onDelete("cascade");
  }
}

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------

type Command =
  | { kind: "index"; columns: string[]; name: string; unique: boolean }
  | { kind: "primary"; columns: string[]; name: string }
  | { kind: "foreign"; key: ForeignKeyDefinition }
  | { kind: "dropColumn"; name: string }
  | { kind: "renameColumn"; from: string; to: string }
  | { kind: "dropIndex"; name: string }
  | { kind: "dropForeign"; name: string };

/** The columns and indexes of a table being created or changed. */
export class Blueprint {
  /** @internal */
  readonly columns: ColumnDefinition[] = [];
  /** @internal */
  readonly commands: Command[] = [];

  constructor(readonly table: string) {}

  private add(
    name: string,
    type: SchemaColumnType,
    params?: ColumnDefinition["params"],
  ): ColumnDefinition {
    const column = new ColumnDefinition(name, type, params);
    this.columns.push(column);
    return column;
  }

  /** Auto-increment integer primary key, `id` by default. */
  id(name = "id"): ColumnDefinition {
    return this.increments(name);
  }

  /** Auto-increment integer primary key. */
  increments(name: string): ColumnDefinition {
    return this.add(name, "increments").primary().autoIncrement();
  }

  /** Auto-increment 64-bit primary key. PostgreSQL and MySQL drivers return it as a string. */
  bigIncrements(name: string): ColumnDefinition {
    return this.add(name, "bigIncrements").primary().autoIncrement();
  }

  /** `VARCHAR(length)`, 255 by default (`NVARCHAR` on SQL Server). */
  string(name: string, length = 255): ColumnDefinition {
    return this.add(name, "string", { length });
  }

  text(name: string): ColumnDefinition {
    return this.add(name, "text");
  }

  integer(name: string): ColumnDefinition {
    return this.add(name, "integer");
  }

  bigInteger(name: string): ColumnDefinition {
    return this.add(name, "bigint");
  }

  float(name: string): ColumnDefinition {
    return this.add(name, "float");
  }

  double(name: string): ColumnDefinition {
    return this.add(name, "double");
  }

  /** Exact number with `precision` digits, `scale` after the point. */
  decimal(name: string, precision = 8, scale = 2): ColumnDefinition {
    return this.add(name, "decimal", { precision, scale });
  }

  boolean(name: string): ColumnDefinition {
    return this.add(name, "boolean");
  }

  date(name: string): ColumnDefinition {
    return this.add(name, "date");
  }

  /** Date and time without a time zone. */
  datetime(name: string): ColumnDefinition {
    return this.add(name, "datetime");
  }

  /** Date and time with a time zone where the database has one (PostgreSQL, SQL Server). */
  timestamp(name: string): ColumnDefinition {
    return this.add(name, "timestamp");
  }

  time(name: string): ColumnDefinition {
    return this.add(name, "time");
  }

  /** JSON (`JSONB` on PostgreSQL, text on SQLite and SQL Server). */
  json(name: string): ColumnDefinition {
    return this.add(name, "json");
  }

  uuid(name: string): ColumnDefinition {
    return this.add(name, "uuid");
  }

  binary(name: string): ColumnDefinition {
    return this.add(name, "binary");
  }

  /** An integer column for a foreign key. Chain `.constrained()` to add the constraint. */
  foreignId(name: string): ColumnDefinition {
    return this.add(name, "integer");
  }

  /** Nullable `created_at` and `updated_at`, which `@CreatedAt` / `@UpdatedAt` fill in. */
  timestamps(): void {
    this.timestamp("created_at").nullable();
    this.timestamp("updated_at").nullable();
  }

  /** A nullable `deleted_at` for soft deletes (`@DeletedAt`). */
  softDeletes(name = "deleted_at"): ColumnDefinition {
    return this.timestamp(name).nullable();
  }

  index(columns: string | string[], name?: string): void {
    const cols = [columns].flat();
    this.commands.push({
      kind: "index",
      columns: cols,
      name: name ?? this.indexName(cols, "index"),
      unique: false,
    });
  }

  unique(columns: string | string[], name?: string): void {
    const cols = [columns].flat();
    this.commands.push({
      kind: "index",
      columns: cols,
      name: name ?? this.indexName(cols, "unique"),
      unique: true,
    });
  }

  /** A primary key over several columns. */
  primary(columns: string[], name?: string): void {
    this.commands.push({
      kind: "primary",
      columns,
      name: name ?? `${this.table}_pkey`,
    });
  }

  /** A foreign key on existing columns. */
  foreign(columns: string | string[], name?: string): ForeignKeyDefinition {
    const cols = [columns].flat();
    const key = new ForeignKeyDefinition(
      cols,
      name ?? this.indexName(cols, "foreign"),
    );
    this.commands.push({ kind: "foreign", key });
    return key;
  }

  dropColumn(...names: string[]): void {
    for (const name of names) this.commands.push({ kind: "dropColumn", name });
  }

  renameColumn(from: string, to: string): void {
    this.commands.push({ kind: "renameColumn", from, to });
  }

  /** Drop an index by name, or by the columns it was created on. */
  dropIndex(nameOrColumns: string | string[]): void {
    this.commands.push({
      kind: "dropIndex",
      name: Array.isArray(nameOrColumns)
        ? this.indexName(nameOrColumns, "index")
        : nameOrColumns,
    });
  }

  /** Drop a unique index by name, or by its columns. */
  dropUnique(nameOrColumns: string | string[]): void {
    this.commands.push({
      kind: "dropIndex",
      name: Array.isArray(nameOrColumns)
        ? this.indexName(nameOrColumns, "unique")
        : nameOrColumns,
    });
  }

  /** Drop a foreign key by name, or by its columns. */
  dropForeign(nameOrColumns: string | string[]): void {
    this.commands.push({
      kind: "dropForeign",
      name: Array.isArray(nameOrColumns)
        ? this.indexName(nameOrColumns, "foreign")
        : nameOrColumns,
    });
  }

  dropTimestamps(): void {
    this.dropColumn("created_at", "updated_at");
  }

  dropSoftDeletes(name = "deleted_at"): void {
    this.dropColumn(name);
  }

  /** @internal `users_email_unique`, the name Megh gives indexes and keys. */
  indexName(columns: string[], suffix: string): string {
    return `${this.table}_${columns.join("_")}_${suffix}`;
  }
}

// ---------------------------------------------------------------------------
// SQL types
// ---------------------------------------------------------------------------

function sqlType(dialect: SchemaDialect, column: ColumnDefinition): string {
  const { length = 255, precision = 8, scale = 2 } = column.params;
  const type = column.type;
  switch (dialect) {
    case "postgres":
      return {
        increments: "integer",
        bigIncrements: "bigint",
        string: `varchar(${length})`,
        text: "text",
        integer: "integer",
        bigint: "bigint",
        float: "real",
        double: "double precision",
        decimal: `numeric(${precision}, ${scale})`,
        boolean: "boolean",
        date: "date",
        datetime: "timestamp",
        timestamp: "timestamptz",
        time: "time",
        json: "jsonb",
        uuid: "uuid",
        binary: "bytea",
      }[type];
    case "mysql":
      return {
        increments: "int",
        bigIncrements: "bigint",
        string: `varchar(${length})`,
        text: "text",
        integer: "int",
        bigint: "bigint",
        float: "float",
        double: "double",
        decimal: `decimal(${precision}, ${scale})`,
        boolean: "boolean",
        date: "date",
        datetime: "datetime",
        timestamp: "datetime",
        time: "time",
        json: "json",
        uuid: "char(36)",
        binary: "blob",
      }[type];
    case "sqlite":
      return {
        increments: "integer",
        bigIncrements: "integer",
        string: `varchar(${length})`,
        text: "text",
        integer: "integer",
        bigint: "integer",
        float: "real",
        double: "real",
        decimal: `numeric(${precision}, ${scale})`,
        boolean: "integer",
        date: "date",
        datetime: "datetime",
        timestamp: "datetime",
        time: "time",
        json: "text",
        uuid: "varchar(36)",
        binary: "blob",
      }[type];
    case "mssql":
      return {
        increments: "int",
        bigIncrements: "bigint",
        string: `nvarchar(${length})`,
        text: "nvarchar(max)",
        integer: "int",
        bigint: "bigint",
        float: "real",
        double: "float",
        decimal: `decimal(${precision}, ${scale})`,
        boolean: "bit",
        date: "date",
        datetime: "datetime2",
        timestamp: "datetimeoffset",
        time: "time",
        json: "nvarchar(max)",
        uuid: "uniqueidentifier",
        binary: "varbinary(max)",
      }[type];
  }
}

/** A default value the database accepts in DDL. */
function defaultValue(dialect: SchemaDialect, value: unknown): unknown {
  if (
    typeof value === "boolean" &&
    (dialect === "sqlite" || dialect === "mssql")
  ) {
    return value ? 1 : 0;
  }
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Creates, changes and drops tables. Migrations defined with `defineMigration` receive one. */
export class Schema {
  readonly dialect: SchemaDialect;

  constructor(private readonly db: Kysely<any>) {
    this.dialect = dialectOf(db);
  }

  /** Create a table. */
  async create(
    table: string,
    define: (table: Blueprint) => void,
  ): Promise<void> {
    const blueprint = new Blueprint(table);
    define(blueprint);
    if (blueprint.columns.length === 0) {
      throw new SchemaError(
        `schema.create("${table}") needs at least one column.`,
      );
    }

    let builder: any = this.db.schema.createTable(table);
    for (const column of blueprint.columns) {
      builder = builder.addColumn(column.name, this.type(column), (col: any) =>
        this.columnConstraints(col, column, "create"),
      );
    }
    for (const column of blueprint.columns) {
      const ref = column.state.references;
      if (!ref) continue;
      builder = builder.addForeignKeyConstraint(
        blueprint.indexName([column.name], "foreign"),
        [column.name],
        ref.table,
        [ref.column],
        (fk: any) =>
          this.actions(fk, column.state.onDelete, column.state.onUpdate),
      );
    }
    const later: Command[] = [];
    for (const command of blueprint.commands) {
      if (command.kind === "primary") {
        builder = builder.addPrimaryKeyConstraint(
          command.name,
          command.columns,
        );
      } else if (command.kind === "foreign") {
        const key = this.checkedKey(command.key);
        builder = builder.addForeignKeyConstraint(
          key.name,
          key.columns,
          key.target!.table,
          [key.target!.column],
          (fk: any) => this.actions(fk, key.deleteAction, key.updateAction),
        );
      } else if (command.kind === "index" && command.unique) {
        builder = builder.addUniqueConstraint(command.name, command.columns);
      } else {
        later.push(command);
      }
    }
    await builder.execute();
    await this.run(blueprint, later);
  }

  /** Change a table: add columns, drop or rename them, add or drop indexes and keys. */
  async table(
    table: string,
    define: (table: Blueprint) => void,
  ): Promise<void> {
    const blueprint = new Blueprint(table);
    define(blueprint);

    for (const column of blueprint.columns) {
      await this.db.schema
        .alterTable(table)
        .addColumn(column.name, this.type(column), (col: any) =>
          this.columnConstraints(col, column, "alter"),
        )
        .execute();
      if (column.state.unique) {
        await this.db.schema
          .createIndex(blueprint.indexName([column.name], "unique"))
          .on(table)
          .column(column.name)
          .unique()
          .execute();
      }
      const ref = column.state.references;
      if (ref && this.dialect !== "sqlite") {
        await this.db.schema
          .alterTable(table)
          .addForeignKeyConstraint(
            blueprint.indexName([column.name], "foreign"),
            [column.name],
            ref.table,
            [ref.column],
            (fk: any) =>
              this.actions(fk, column.state.onDelete, column.state.onUpdate),
          )
          .execute();
      }
    }
    await this.run(blueprint, blueprint.commands);
  }

  /** Drop a table. */
  async drop(table: string): Promise<void> {
    await this.db.schema.dropTable(table).execute();
  }

  /** Drop a table if it exists. */
  async dropIfExists(table: string): Promise<void> {
    await this.db.schema.dropTable(table).ifExists().execute();
  }

  /** Rename a table. */
  async rename(from: string, to: string): Promise<void> {
    if (this.dialect === "mssql") {
      await this.raw(`exec sp_rename ${quote(from)}, ${quote(to)}`);
      return;
    }
    await this.db.schema.alterTable(from).renameTo(to).execute();
  }

  /** Whether `table` exists. */
  async hasTable(table: string): Promise<boolean> {
    const tables = await this.db.introspection.getTables();
    return tables.some((t) => t.name === table);
  }

  /** Whether `table` has `column`. */
  async hasColumn(table: string, column: string): Promise<boolean> {
    const tables = await this.db.introspection.getTables();
    return !!tables
      .find((t) => t.name === table)
      ?.columns.some((c) => c.name === column);
  }

  /** Run a SQL statement as written, for what the builder doesn't cover. */
  async raw(statement: string): Promise<void> {
    await kysely().sql.raw(statement).execute(this.db);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private type(column: ColumnDefinition) {
    return kysely().sql.raw(sqlType(this.dialect, column));
  }

  private columnConstraints(
    col: any,
    column: ColumnDefinition,
    mode: "create" | "alter",
  ) {
    const s = column.state;
    if (s.autoIncrement) {
      if (this.dialect === "postgres") col = col.generatedByDefaultAsIdentity();
      else if (this.dialect === "mssql") col = col.identity();
    }
    if (s.primary) col = col.primaryKey();
    if (
      s.autoIncrement &&
      (this.dialect === "mysql" || this.dialect === "sqlite")
    ) {
      col = col.autoIncrement();
    }
    if (!s.nullable && !s.primary) col = col.notNull();
    // SQLite can't add a UNIQUE column to an existing table: table() adds an index instead.
    if (s.unique && mode === "create") col = col.unique();
    if (s.default) {
      col =
        "current" in s.default
          ? col.defaultTo(kysely().sql`CURRENT_TIMESTAMP`)
          : col.defaultTo(defaultValue(this.dialect, s.default.value));
    }
    // SQLite has no ALTER TABLE ADD CONSTRAINT, but takes REFERENCES on a new column.
    if (mode === "alter" && s.references && this.dialect === "sqlite") {
      col = col.references(`${s.references.table}.${s.references.column}`);
      col = this.actions(col, s.onDelete, s.onUpdate);
    }
    return col;
  }

  /** SQL Server: drop the (auto-named) default constraint on `table.column`, if any. */
  private async dropDefaultConstraint(
    table: string,
    column: string,
  ): Promise<void> {
    await kysely().sql`
      declare @table int = object_id(${table});
      declare @name sysname = (
        select d.name from sys.default_constraints d
        join sys.columns c on c.object_id = d.parent_object_id and c.column_id = d.parent_column_id
        where d.parent_object_id = @table and c.name = ${column}
      );
      if @name is not null
      begin
        declare @drop nvarchar(max) = 'alter table ' + quotename(object_schema_name(@table)) + '.'
          + quotename(object_name(@table)) + ' drop constraint ' + quotename(@name);
        exec sp_executesql @drop;
      end
    `.execute(this.db);
  }

  private actions(
    builder: any,
    onDelete?: ReferentialAction,
    onUpdate?: ReferentialAction,
  ) {
    if (onDelete) builder = builder.onDelete(onDelete);
    if (onUpdate) builder = builder.onUpdate(onUpdate);
    return builder;
  }

  private checkedKey(key: ForeignKeyDefinition): ForeignKeyDefinition {
    if (!key.target) {
      throw new SchemaError(
        `Foreign key ${key.name} has no target. Add .references("table.column").`,
      );
    }
    return key;
  }

  private async run(blueprint: Blueprint, commands: Command[]): Promise<void> {
    const table = blueprint.table;
    const schema = this.db.schema;
    for (const command of commands) {
      switch (command.kind) {
        case "index": {
          let index = schema
            .createIndex(command.name)
            .on(table)
            .columns(command.columns);
          if (command.unique) index = index.unique();
          await index.execute();
          break;
        }
        case "primary":
          if (this.dialect === "sqlite") {
            throw new SchemaError(
              "SQLite can't add a primary key to an existing table. Declare it in schema.create().",
            );
          }
          await schema
            .alterTable(table)
            .addPrimaryKeyConstraint(command.name, command.columns)
            .execute();
          break;
        case "foreign": {
          if (this.dialect === "sqlite") {
            throw new SchemaError(
              "SQLite can't add a foreign key to an existing column. Add it with the column (foreignId(...).constrained()) or in schema.create().",
            );
          }
          const key = this.checkedKey(command.key);
          await schema
            .alterTable(table)
            .addForeignKeyConstraint(
              key.name,
              key.columns,
              key.target!.table,
              [key.target!.column],
              (fk: any) => this.actions(fk, key.deleteAction, key.updateAction),
            )
            .execute();
          break;
        }
        case "dropColumn":
          // SQL Server won't drop a column while its default constraint exists.
          if (this.dialect === "mssql") {
            await this.dropDefaultConstraint(table, command.name);
          }
          await schema.alterTable(table).dropColumn(command.name).execute();
          break;
        case "renameColumn":
          if (this.dialect === "mssql") {
            await this.raw(
              `exec sp_rename ${quote(`${table}.${command.from}`)}, ${quote(command.to)}, 'COLUMN'`,
            );
          } else {
            await schema
              .alterTable(table)
              .renameColumn(command.from, command.to)
              .execute();
          }
          break;
        case "dropIndex": {
          let drop = schema.dropIndex(command.name);
          if (this.dialect === "mysql" || this.dialect === "mssql")
            drop = drop.on(table);
          await drop.execute();
          break;
        }
        case "dropForeign":
          if (this.dialect === "sqlite") {
            throw new SchemaError(
              "SQLite can't drop a foreign key from an existing table.",
            );
          }
          if (this.dialect === "mysql") {
            await this.raw(
              `alter table \`${table}\` drop foreign key \`${command.name}\``,
            );
          } else {
            await schema
              .alterTable(table)
              .dropConstraint(command.name)
              .execute();
          }
          break;
      }
    }
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
