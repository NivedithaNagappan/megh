/**
 * The query builder, for queries that don't fit a model: reports, bulk
 * updates, tables without a model.
 *
 * ```ts
 * const rows = await DB.table("orders")
 *   .select("customer_id")
 *   .selectRaw("sum(total) as revenue")
 *   .where("status", "paid")
 *   .whereBetween("created_at", [from, to])
 *   .groupBy("customer_id")
 *   .orderBy("revenue", "desc")
 *   .limit(10)
 *   .get();
 * ```
 *
 * Queries run in the current `DB.transaction()` / `Model.transaction()` when
 * there is one. Values are always sent as parameters, never put in the SQL.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Kysely's builders
   change type with every call; the chains here are built up in loops. */
import type { Kysely, Transaction } from "kysely";
import { NotFoundException, normalizePageRequest, paginated } from "./core";
import type { PageRequest, Paginated } from "./core";
import { bindable, isSqlite } from "./casts";
import { getConnection, runInTransaction } from "./connection";
import { kysely } from "./engine";
import { applyPaging } from "./paging";

export type Operator =
  | "="
  | "!="
  | "<>"
  | "<"
  | "<="
  | ">"
  | ">="
  | "like"
  | "not like"
  | "ilike"
  | "in"
  | "not in"
  | "is"
  | "is not";

const OPERATORS = new Set<string>([
  "=",
  "!=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
  "like",
  "not like",
  "ilike",
  "in",
  "not in",
  "is",
  "is not",
]);

type Row = Record<string, any>;
type Expr = (eb: any, sqlite: boolean) => any;
type Clause = { or: boolean; build: Expr };

function bind(value: unknown, sqlite: boolean): unknown {
  return Array.isArray(value)
    ? value.map((v) => bindable(v, sqlite))
    : bindable(value, sqlite);
}

/** SQL text with `?` placeholders, and the values for them. */
function rawSql(text: string, bindings: readonly unknown[] = []) {
  const parts = text.split("?");
  if (parts.length - 1 !== bindings.length) {
    throw new Error(
      `[Megh ORM] The SQL has ${parts.length - 1} "?" placeholders but ${bindings.length} values were given.`,
    );
  }
  const strings = Object.assign([...parts], { raw: [...parts] });
  return kysely().sql(strings as unknown as TemplateStringsArray, ...bindings);
}

/** `where` conditions, shared by queries and nested groups. */
export class WhereClauses<Self> {
  /** @internal */
  protected clauses: Clause[] = [];

  private push(or: boolean, build: Expr): Self {
    this.clauses.push({ or, build });
    return this as unknown as Self;
  }

  private comparison(or: boolean, args: unknown[]): Self {
    if (typeof args[0] === "function") {
      const group = new WhereGroup();
      (args[0] as (q: WhereGroup) => void)(group);
      return this.push(or, (eb, sqlite) => group.toExpression(eb, sqlite));
    }
    if (args[0] !== null && typeof args[0] === "object") {
      const entries = Object.entries(args[0] as Row);
      return this.push(or, (eb, sqlite) =>
        eb.and(entries.map(([c, v]) => compare(eb, c, "=", v, sqlite))),
      );
    }
    const [column, opOrValue, maybe] = args as [string, unknown, unknown];
    const [op, value] =
      args.length >= 3
        ? [String(opOrValue).toLowerCase(), maybe]
        : ["=", opOrValue];
    if (!OPERATORS.has(op)) {
      throw new Error(
        `[Megh ORM] Unknown operator "${op}" in where("${column}", …).`,
      );
    }
    return this.push(or, (eb, sqlite) =>
      compare(eb, column, op, value, sqlite),
    );
  }

  /**
   * `where("status", "paid")`, `where("total", ">", 100)`,
   * `where({ status: "paid", currency: "EUR" })`, or a group:
   * `where((q) => q.where("a", 1).orWhere("b", 2))`.
   */
  where(column: string, value: unknown): Self;
  where(column: string, operator: Operator, value: unknown): Self;
  where(group: (query: WhereGroup) => void): Self;
  where(values: Row): Self;
  where(...args: unknown[]): Self {
    return this.comparison(false, args);
  }

  orWhere(column: string, value: unknown): Self;
  orWhere(column: string, operator: Operator, value: unknown): Self;
  orWhere(group: (query: WhereGroup) => void): Self;
  orWhere(values: Row): Self;
  orWhere(...args: unknown[]): Self {
    return this.comparison(true, args);
  }

  whereIn(column: string, values: readonly unknown[]): Self {
    return this.push(false, (eb, sqlite) =>
      inList(eb, column, values, false, sqlite),
    );
  }

  whereNotIn(column: string, values: readonly unknown[]): Self {
    return this.push(false, (eb, sqlite) =>
      inList(eb, column, values, true, sqlite),
    );
  }

  whereNull(column: string): Self {
    return this.push(false, (eb) => eb(column, "is", null));
  }

  whereNotNull(column: string): Self {
    return this.push(false, (eb) => eb(column, "is not", null));
  }

  orWhereNull(column: string): Self {
    return this.push(true, (eb) => eb(column, "is", null));
  }

  orWhereNotNull(column: string): Self {
    return this.push(true, (eb) => eb(column, "is not", null));
  }

  whereBetween(column: string, [from, to]: readonly [unknown, unknown]): Self {
    return this.push(false, (eb, sqlite) =>
      eb.between(eb.ref(column), bindable(from, sqlite), bindable(to, sqlite)),
    );
  }

  whereNotBetween(
    column: string,
    [from, to]: readonly [unknown, unknown],
  ): Self {
    return this.push(false, (eb, sqlite) =>
      eb.not(
        eb.between(
          eb.ref(column),
          bindable(from, sqlite),
          bindable(to, sqlite),
        ),
      ),
    );
  }

  /** Compare two columns: `whereColumn("updated_at", ">", "created_at")`. */
  whereColumn(left: string, operator: Operator, right: string): Self {
    return this.push(false, (eb) => eb(left, operator, eb.ref(right)));
  }

  /** A condition in SQL, with `?` placeholders: `whereRaw("lower(email) = ?", [email])`. */
  whereRaw(sql: string, bindings: readonly unknown[] = []): Self {
    return this.push(false, () => rawSql(sql, bindings));
  }

  orWhereRaw(sql: string, bindings: readonly unknown[] = []): Self {
    return this.push(true, () => rawSql(sql, bindings));
  }

  /**
   * @internal The conditions as one expression. `and` binds tighter than
   * `or`, as in SQL: `a or b and c` is `a or (b and c)`.
   */
  toExpression(eb: any, sqlite: boolean): any {
    const groups: any[][] = [];
    for (const clause of this.clauses) {
      if (clause.or || groups.length === 0) groups.push([]);
      groups[groups.length - 1].push(clause.build(eb, sqlite));
    }
    const ands = groups.map((g) => (g.length === 1 ? g[0] : eb.and(g)));
    return ands.length === 1 ? ands[0] : eb.or(ands);
  }

  /** @internal */
  hasClauses(): boolean {
    return this.clauses.length > 0;
  }
}

/** The conditions inside `where((q) => …)`, put in parentheses. */
export class WhereGroup extends WhereClauses<WhereGroup> {}

function compare(
  eb: any,
  column: string,
  op: string,
  value: unknown,
  sqlite: boolean,
) {
  if (value === null && (op === "=" || op === "!=" || op === "<>")) {
    return eb(column, op === "=" ? "is" : "is not", null);
  }
  if (op === "in" || op === "not in") {
    return inList(eb, column, value as unknown[], op === "not in", sqlite);
  }
  return eb(column, op, bind(value, sqlite));
}

function inList(
  eb: any,
  column: string,
  values: readonly unknown[],
  not: boolean,
  sqlite: boolean,
) {
  // `in ()` is invalid SQL: nothing is in an empty list, everything is outside it.
  if (values.length === 0) return kysely().sql.raw(not ? "1 = 1" : "1 = 0");
  return eb(column, not ? "not in" : "in", bind([...values], sqlite));
}

type Order = { column: string; direction: "asc" | "desc" } | { raw: string };
type Join = {
  kind: "inner" | "left" | "right";
  table: string;
  left: string;
  op: string;
  right: string;
};

/** A query on one table. Build it with `DB.table(name)`. */
export class TableQuery<T extends Row = Row> extends WhereClauses<
  TableQuery<T>
> {
  private columns: string[] = [];
  private rawColumns: { sql: string; bindings: readonly unknown[] }[] = [];
  private isDistinct = false;
  private joins: Join[] = [];
  private orders: Order[] = [];
  private groups: string[] = [];
  private havings = new WhereGroup();
  private limitValue?: number;
  private offsetValue?: number;

  constructor(private readonly tableName: string) {
    super();
  }

  // ── Building ─────────────────────────────────────────────────────────────

  /** Columns to return; `"users.email as contact"` aliases one. All columns by default. */
  select(...columns: string[]): this {
    this.columns.push(...columns.flat());
    return this;
  }

  /** A selected expression in SQL: `selectRaw("count(*) as total")`. */
  selectRaw(sql: string, bindings: readonly unknown[] = []): this {
    this.rawColumns.push({ sql, bindings });
    return this;
  }

  distinct(): this {
    this.isDistinct = true;
    return this;
  }

  /** Inner join: `join("users", "users.id", "orders.user_id")` or with an operator. */
  join(table: string, left: string, right: string): this;
  join(table: string, left: string, operator: Operator, right: string): this;
  join(table: string, left: string, ...rest: string[]): this {
    return this.addJoin("inner", table, left, rest);
  }

  leftJoin(table: string, left: string, right: string): this;
  leftJoin(
    table: string,
    left: string,
    operator: Operator,
    right: string,
  ): this;
  leftJoin(table: string, left: string, ...rest: string[]): this {
    return this.addJoin("left", table, left, rest);
  }

  rightJoin(table: string, left: string, right: string): this;
  rightJoin(
    table: string,
    left: string,
    operator: Operator,
    right: string,
  ): this;
  rightJoin(table: string, left: string, ...rest: string[]): this {
    return this.addJoin("right", table, left, rest);
  }

  private addJoin(
    kind: Join["kind"],
    table: string,
    left: string,
    rest: string[],
  ): this {
    const [op, right] = rest.length === 2 ? rest : ["=", rest[0]];
    this.joins.push({ kind, table, left, op, right });
    return this;
  }

  orderBy(column: string, direction: "asc" | "desc" = "asc"): this {
    this.orders.push({ column, direction });
    return this;
  }

  orderByDesc(column: string): this {
    return this.orderBy(column, "desc");
  }

  /** Order in SQL: `orderByRaw("random()")`. */
  orderByRaw(sql: string): this {
    this.orders.push({ raw: sql });
    return this;
  }

  /** Newest first, by `created_at` unless another column is given. */
  latest(column = "created_at"): this {
    return this.orderBy(column, "desc");
  }

  oldest(column = "created_at"): this {
    return this.orderBy(column, "asc");
  }

  groupBy(...columns: string[]): this {
    this.groups.push(...columns);
    return this;
  }

  /** A condition on grouped rows: `having("total", ">", 100)`. */
  having(column: string, operator: Operator, value: unknown): this {
    this.havings.where(column, operator, value);
    return this;
  }

  havingRaw(sql: string, bindings: readonly unknown[] = []): this {
    this.havings.whereRaw(sql, bindings);
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  /** Same as `limit()`. */
  take(count: number): this {
    return this.limit(count);
  }

  /** Same as `offset()`. */
  skip(count: number): this {
    return this.offset(count);
  }

  /** Limit and offset for page `page` (from 1) of `perPage` rows. */
  forPage(page: number, perPage = 15): this {
    return this.limit(perPage).offset((Math.max(1, page) - 1) * perPage);
  }

  // ── Reading ──────────────────────────────────────────────────────────────

  /** Every matching row. */
  async get(): Promise<T[]> {
    return (await this.selectQuery().execute()) as T[];
  }

  /** The first matching row, or `undefined`. */
  async first(): Promise<T | undefined> {
    const rows = await this.clone().limit(1).get();
    return rows[0];
  }

  /** The first matching row, or a 404 `NotFoundException`. */
  async firstOrFail(): Promise<T> {
    const row = await this.first();
    if (!row)
      throw new NotFoundException(`No row in ${this.tableName} matches`);
    return row;
  }

  /** One column of the first matching row. */
  async value<V = unknown>(column: string): Promise<V | undefined> {
    const row = await this.clone().reset("columns").select(column).first();
    return row ? (Object.values(row)[0] as V) : undefined;
  }

  /** One column of every matching row. */
  async pluck<V = unknown>(column: string): Promise<V[]> {
    const rows = await this.clone().reset("columns").select(column).get();
    return rows.map((row) => Object.values(row)[0] as V);
  }

  async exists(): Promise<boolean> {
    return (
      (await this.clone().reset("columns").selectRaw("1 as one").first()) !==
      undefined
    );
  }

  async doesntExist(): Promise<boolean> {
    return !(await this.exists());
  }

  /** Number of matching rows (of non-null `column` values, if given). */
  async count(column?: string): Promise<number> {
    const value = await this.aggregate((eb) =>
      column ? eb.fn.count(column) : eb.fn.countAll(),
    );
    return Number(value ?? 0);
  }

  /** Sum of `column`; `0` when nothing matches. */
  async sum(column: string): Promise<number> {
    return Number((await this.aggregate((eb) => eb.fn.sum(column))) ?? 0);
  }

  /** Average of `column`; `null` when nothing matches. */
  async avg(column: string): Promise<number | null> {
    const value = await this.aggregate((eb) => eb.fn.avg(column));
    return value === null || value === undefined ? null : Number(value);
  }

  async min<V = unknown>(column: string): Promise<V | null> {
    return ((await this.aggregate((eb) => eb.fn.min(column))) ??
      null) as V | null;
  }

  async max<V = unknown>(column: string): Promise<V | null> {
    return ((await this.aggregate((eb) => eb.fn.max(column))) ??
      null) as V | null;
  }

  /** One page of rows and the total: `{ data, meta: { total, page, perPage, lastPage, … } }`. */
  async paginate(request: PageRequest = {}): Promise<Paginated<T>> {
    const { page, perPage, offset } = normalizePageRequest(request);
    const total = await this.count();
    const data = await this.clone().limit(perPage).offset(offset).get();
    return paginated(data, total, page, perPage);
  }

  // ── Writing ──────────────────────────────────────────────────────────────

  /**
   * Insert one row or several, in order. Consecutive rows with the same
   * columns go in one statement; a column a row leaves out gets its
   * database default.
   */
  async insert(rows: Row | Row[]): Promise<void> {
    const list = [rows].flat();
    if (list.length === 0) return;
    const db = getConnection();
    const sqlite = isSqlite(db);
    // A multi-row insert fills missing columns with NULL rather than their
    // default, so a new statement starts whenever the columns change.
    const batches: { key: string; rows: Row[] }[] = [];
    for (const row of list.map((r) => bindRow(r, sqlite))) {
      const key = Object.keys(row).sort().join("\0");
      const last = batches[batches.length - 1];
      if (last?.key === key) last.rows.push(row);
      else batches.push({ key, rows: [row] });
    }
    for (const batch of batches) {
      await db.insertInto(this.tableName).values(batch.rows).execute();
    }
  }

  /** Insert a row and return the id the database gave it. */
  async insertGetId<Id = number>(row: Row, idColumn = "id"): Promise<Id> {
    const db = getConnection();
    const values = bindRow(row, isSqlite(db));
    const insert = db.insertInto(this.tableName).values(values);
    const adapter = db.getExecutor().adapter;
    if (adapter.supportsOutput) {
      // SQL Server has no RETURNING and its driver gives no insertId.
      const result: any = await insert
        .output(`inserted.${idColumn}` as any)
        .executeTakeFirstOrThrow();
      return result[idColumn] as Id;
    }
    if (adapter.supportsReturning) {
      const result: any = await insert
        .returning(idColumn)
        .executeTakeFirstOrThrow();
      return result[idColumn] as Id;
    }
    const result = await insert.executeTakeFirstOrThrow();
    return Number(result.insertId) as Id;
  }

  /** Update the matching rows. Returns how many were updated. */
  async update(values: Row): Promise<number> {
    const db = getConnection();
    const query = this.whereOn(
      db.updateTable(this.tableName).set(bindRow(values, isSqlite(db))),
      isSqlite(db),
    );
    const result = await query.executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0);
  }

  /** Add `amount` (default 1) to `column` on the matching rows, and set `extra` columns. */
  async increment(
    column: string,
    amount = 1,
    extra: Row = {},
  ): Promise<number> {
    return this.adjust(column, "+", amount, extra);
  }

  async decrement(
    column: string,
    amount = 1,
    extra: Row = {},
  ): Promise<number> {
    return this.adjust(column, "-", amount, extra);
  }

  /** Delete the matching rows. Returns how many were deleted. */
  async delete(): Promise<number> {
    const db = getConnection();
    const query = this.whereOn(db.deleteFrom(this.tableName), isSqlite(db));
    const result = await query.executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }

  // ── Inspecting ───────────────────────────────────────────────────────────

  /** The SQL and parameters this query would run, for debugging. */
  toSQL(): { sql: string; parameters: readonly unknown[] } {
    const { sql, parameters } = this.selectQuery().compile();
    return { sql, parameters };
  }

  /** A copy to build on without changing this query. */
  clone(): TableQuery<T> {
    const copy = new TableQuery<T>(this.tableName);
    copy.clauses = [...this.clauses];
    copy.columns = [...this.columns];
    copy.rawColumns = [...this.rawColumns];
    copy.isDistinct = this.isDistinct;
    copy.joins = [...this.joins];
    copy.orders = [...this.orders];
    copy.groups = [...this.groups];
    copy.havings = this.havings;
    copy.limitValue = this.limitValue;
    copy.offsetValue = this.offsetValue;
    return copy;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private reset(part: "columns" | "orders"): this {
    if (part === "columns") {
      this.columns = [];
      this.rawColumns = [];
    } else {
      this.orders = [];
    }
    return this;
  }

  private whereOn(query: any, sqlite: boolean): any {
    return this.hasClauses()
      ? query.where((eb: any) => this.toExpression(eb, sqlite))
      : query;
  }

  private base(db: Kysely<any> | Transaction<any>): any {
    const sqlite = isSqlite(db);
    let query: any = db.selectFrom(this.tableName);
    for (const join of this.joins) {
      const method = {
        inner: "innerJoin",
        left: "leftJoin",
        right: "rightJoin",
      }[join.kind];
      query =
        join.op === "="
          ? query[method](join.table, join.left, join.right)
          : query[method](join.table, (on: any) =>
              on.on(join.left, join.op, on.ref(join.right)),
            );
    }
    query = this.whereOn(query, sqlite);
    if (this.groups.length) query = query.groupBy(this.groups);
    if (this.havings.hasClauses()) {
      query = query.having((eb: any) => this.havings.toExpression(eb, sqlite));
    }
    return query;
  }

  private selectQuery(): any {
    const db = getConnection();
    let query = this.base(db);
    if (this.columns.length === 0 && this.rawColumns.length === 0) {
      query = query.selectAll();
    } else {
      if (this.columns.length) query = query.select(this.columns);
      for (const raw of this.rawColumns) {
        query = query.select(rawSql(raw.sql, raw.bindings) as any);
      }
    }
    if (this.isDistinct) query = query.distinct();
    for (const order of this.orders) {
      query =
        "raw" in order
          ? query.orderBy(kysely().sql.raw(order.raw))
          : query.orderBy(order.column, order.direction);
    }
    return applyPaging(db, query, {
      limit: this.limitValue,
      offset: this.offsetValue,
      ordered: this.orders.length > 0,
    });
  }

  private async aggregate(fn: (eb: any) => any): Promise<unknown> {
    const db = getConnection();
    // Grouped or distinct queries are counted as a subquery, as their rows.
    if (this.groups.length || this.isDistinct) {
      const inner = this.clone().reset("orders");
      inner.limitValue = undefined;
      inner.offsetValue = undefined;
      const row: any = await db
        .selectFrom(inner.selectQuery().as("sub"))
        .select((eb: any) => fn(eb).as("aggregate"))
        .executeTakeFirst();
      return row?.aggregate;
    }
    const row: any = await this.base(db)
      .select((eb: any) => fn(eb).as("aggregate"))
      .executeTakeFirst();
    return row?.aggregate;
  }

  private async adjust(
    column: string,
    op: "+" | "-",
    amount: number,
    extra: Row,
  ): Promise<number> {
    const db = getConnection();
    const sqlite = isSqlite(db);
    const query = this.whereOn(
      db.updateTable(this.tableName).set((eb: any) => ({
        ...bindRow(extra, sqlite),
        [column]: eb(column, op, amount),
      })),
      sqlite,
    );
    const result = await query.executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0);
  }
}

function bindRow(row: Row, sqlite: boolean): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    out[key] =
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Buffer.isBuffer(value)
        ? JSON.stringify(value)
        : bindable(value, sqlite);
  }
  return out;
}

/**
 * The query builder and raw SQL.
 *
 * ```ts
 * await DB.table("users").where("active", true).count();
 * await DB.select("select * from users where email = ?", [email]);
 * await DB.transaction(async () => { … });
 * ```
 */
export const DB = {
  /** A query on `table`. Type the rows with `DB.table<{ id: number; email: string }>("users")`. */
  table<T extends Row = Row>(table: string): TableQuery<T> {
    return new TableQuery<T>(table);
  },

  /** Run a query in SQL and return its rows. Use `?` for values. */
  async select<T extends Row = Row>(
    sql: string,
    bindings: readonly unknown[] = [],
  ): Promise<T[]> {
    const db = getConnection();
    const result = await rawSql(
      sql,
      bind([...bindings], isSqlite(db)) as unknown[],
    ).execute(db);
    return result.rows as T[];
  },

  /** Run a statement in SQL (insert, update, DDL, …). Returns the number of rows it changed, when known. */
  async statement(
    sql: string,
    bindings: readonly unknown[] = [],
  ): Promise<number> {
    const db = getConnection();
    const result = await rawSql(
      sql,
      bind([...bindings], isSqlite(db)) as unknown[],
    ).execute(db);
    return Number(result.numAffectedRows ?? 0);
  },

  /**
   * Run `fn` in a transaction that every query inside uses, models included.
   * Commits when `fn` resolves, rolls back if it throws. Nested calls run in
   * a savepoint.
   */
  transaction<R>(fn: () => Promise<R>): Promise<R> {
    return runInTransaction(() => fn(), { savepoint: true });
  },
};
