/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import type {
  ComparisonOperatorExpression,
  Expression,
  ExpressionBuilder,
  SqlBool,
} from "kysely";
import { NotFoundException } from "../common/exceptions";
import {
  normalizePageRequest,
  paginated,
  type PageRequest,
  type Paginated,
} from "../collection/pagination";
import { bindable, castToDatabase, isSqlite } from "./casts";
import { getConnection } from "./connection";
import { getRelation, type RelationDefinition } from "./relations";
import { hydrate, tableOf, withTimestamps } from "./state";
import type {
  ColumnKeys,
  Columns,
  ModelClass,
  RelationPaths,
  Row,
  UpdateInput,
} from "./types";

export type ComparisonOperator = ComparisonOperatorExpression;

/** A Kysely query builder; the ORM keeps them untyped internally. */
type Builder = any;
/** `bind` makes a value bindable for the current dialect. */
type Step = (qb: Builder, bind: (value: unknown) => unknown) => Builder;

type TrashedScope = "without" | "with" | "only";

/**
 * A query on one model, e.g. `User.where("active", true).with("posts").get()`.
 * Nothing runs until `get()`, `first()`, `count()`, `paginate()`, `update()`
 * or `delete()` is called. Results are model instances.
 */
export class ModelQuery<
  M,
  P extends string = never,
  S extends ColumnKeys<M> = ColumnKeys<M>,
> {
  private filters: Step[] = [];
  private ordering: Step[] = [];
  private limitCount?: number;
  private offsetCount?: number;
  private eager: string[] = [];
  private selected?: string[];
  private trashed: TrashedScope = "without";

  constructor(private readonly model: ModelClass<M>) {}

  /** `where(column, value)`: equality; `null` becomes `IS NULL`. */
  where<K extends keyof Columns<M> & string>(
    column: K,
    value: Columns<M>[K],
  ): this;
  /** `where(column, op, value)`, e.g. `where("age", ">=", 18)`. */
  where<K extends keyof Columns<M> & string>(
    column: K,
    op: ComparisonOperator,
    value: Columns<M>[K] | readonly Columns<M>[K][],
  ): this;
  /**
   * `where(eb => …)`: any Kysely expression, e.g. OR groups:
   * `where(eb => eb.or([eb("role", "=", "admin"), eb("id", "=", 1)]))`.
   */
  where(
    expression: (eb: ExpressionBuilder<any, any>) => Expression<SqlBool>,
  ): this;
  where(column: unknown, opOrValue?: unknown, value?: unknown): this {
    if (typeof column === "function") {
      this.filters.push((qb) => qb.where(column));
    } else if (arguments.length === 2) {
      const op = opOrValue === null ? "is" : "=";
      this.filters.push((qb, bind) => qb.where(column, op, bind(opOrValue)));
    } else {
      this.filters.push((qb, bind) =>
        qb.where(
          column,
          opOrValue,
          Array.isArray(value) ? value.map(bind) : bind(value),
        ),
      );
    }
    return this;
  }

  whereIn<K extends keyof Columns<M> & string>(
    column: K,
    values: readonly Columns<M>[K][],
  ): this {
    // `IN ()` is invalid SQL; an empty list matches nothing.
    this.filters.push((qb, bind) =>
      values.length === 0
        ? qb.where((eb: any) => eb(eb.lit(1), "=", eb.lit(0)))
        : qb.where(column, "in", values.map(bind)),
    );
    return this;
  }

  whereNotIn<K extends keyof Columns<M> & string>(
    column: K,
    values: readonly Columns<M>[K][],
  ): this {
    if (values.length > 0) {
      this.filters.push((qb, bind) =>
        qb.where(column, "not in", values.map(bind)),
      );
    }
    return this;
  }

  whereNull(column: keyof Columns<M> & string): this {
    this.filters.push((qb) => qb.where(column, "is", null));
    return this;
  }

  whereNotNull(column: keyof Columns<M> & string): this {
    this.filters.push((qb) => qb.where(column, "is not", null));
    return this;
  }

  orderBy(
    column: keyof Columns<M> & string,
    direction: "asc" | "desc" = "asc",
  ): this {
    this.ordering.push((qb) => qb.orderBy(column, direction));
    return this;
  }

  /** Include soft-deleted rows. */
  withTrashed(): this {
    this.trashed = "with";
    return this;
  }

  /** Only soft-deleted rows. */
  onlyTrashed(): this {
    this.trashed = "only";
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  /** Only fetch these columns. The result type narrows to them. */
  select<K extends keyof Columns<M> & string>(
    ...columns: K[]
  ): ModelQuery<M, P, K> {
    this.selected = columns;
    return this as unknown as ModelQuery<M, P, K>;
  }

  /**
   * Eager-load relations, nested with dots: `with("posts.comments", "profile")`.
   * Runs one query per relation level, however many rows there are.
   */
  with<Q extends RelationPaths<M>>(...paths: Q[]): ModelQuery<M, P | Q, S> {
    this.eager.push(...paths);
    return this as unknown as ModelQuery<M, P | Q, S>;
  }

  async get(): Promise<Row<M, P, S>[]> {
    let qb = this.applyFilters(getConnection().selectFrom(tableOf(this.model)));
    const columns = this.selectedColumns();
    qb = columns ? qb.select(columns) : qb.selectAll();
    for (const step of this.ordering) qb = step(qb, (v) => v);
    if (this.limitCount !== undefined) qb = qb.limit(this.limitCount);
    if (this.offsetCount !== undefined) {
      // SQLite and MySQL need a LIMIT before OFFSET.
      if (this.limitCount === undefined) qb = qb.limit(Number.MAX_SAFE_INTEGER);
      qb = qb.offset(this.offsetCount);
    }

    const rows: Record<string, unknown>[] = await qb.execute();
    const models = rows.map((row) => hydrate(this.model, row));
    await eagerLoad(this.model, models, this.eager);
    return models as unknown as Row<M, P, S>[];
  }

  async first(): Promise<Row<M, P, S> | undefined> {
    const [row] = await this.clone().limit(1).get();
    return row;
  }

  /** Like {@link first}, but throws a 404 `NotFoundException` when nothing matches. */
  async firstOrFail(): Promise<Row<M, P, S>> {
    const row = await this.first();
    if (!row) throw new NotFoundException(`${this.model.name} not found`);
    return row;
  }

  async count(): Promise<number> {
    const result = await this.applyFilters(
      getConnection().selectFrom(tableOf(this.model)),
    )
      .select((eb: any) => eb.fn.countAll().as("count"))
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async exists(): Promise<boolean> {
    return (await this.clone().select().limit(1).get()).length > 0;
  }

  /** One page of results in the unified `{ data, meta }` shape. */
  async paginate(request?: PageRequest): Promise<Paginated<Row<M, P, S>>> {
    const { page, perPage, offset } = normalizePageRequest(request);
    const total = await this.count();
    const data = await this.clone().limit(perPage).offset(offset).get();
    return paginated(data, total, page, perPage);
  }

  /**
   * Update every matching row (and `updated_at` when the model has
   * timestamps). Returns the number of rows updated.
   */
  async update(values: UpdateInput<M>): Promise<number> {
    const db = getConnection();
    const data = castToDatabase(
      this.model,
      withTimestamps(this.model, values as Record<string, unknown>, "update"),
      db,
    );
    const result = await this.applyFilters(
      db.updateTable(tableOf(this.model)).set(data),
    ).executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0);
  }

  /**
   * Delete every matching row; soft-deletes when the model has
   * `softDeletes`. Returns the number of rows affected.
   */
  async delete(): Promise<number> {
    if (this.model.softDeletes) {
      return this.update({ [this.model.deletedAt]: new Date() } as any);
    }
    return this.forceDelete();
  }

  /** Delete every matching row permanently, even with `softDeletes`. */
  async forceDelete(): Promise<number> {
    const result = await this.applyFilters(
      getConnection().deleteFrom(tableOf(this.model)),
    ).executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }

  /** Restore matching soft-deleted rows. Returns the number restored. */
  async restore(): Promise<number> {
    assertSoftDeletes(this.model);
    return this.clone()
      .withTrashed()
      .update({ [this.model.deletedAt]: null } as any);
  }

  clone(): ModelQuery<M, P, S> {
    const copy = new ModelQuery<M, P, S>(this.model);
    copy.filters = [...this.filters];
    copy.ordering = [...this.ordering];
    copy.limitCount = this.limitCount;
    copy.offsetCount = this.offsetCount;
    copy.eager = [...this.eager];
    copy.selected = this.selected && [...this.selected];
    copy.trashed = this.trashed;
    return copy;
  }

  private applyFilters(qb: Builder): Builder {
    const sqlite = isSqlite(getConnection());
    const bind = (value: unknown) => bindable(value, sqlite);
    for (const step of this.filters) qb = step(qb, bind);
    if (this.model.softDeletes && this.trashed !== "with") {
      qb = qb.where(
        this.model.deletedAt,
        this.trashed === "only" ? "is not" : "is",
        null,
      );
    }
    return qb;
  }

  /** Selected columns plus the keys eager loading needs, or `undefined` for all. */
  private selectedColumns(): string[] | undefined {
    if (!this.selected) return undefined;
    const columns = new Set(this.selected);
    columns.add(this.model.primaryKey);
    for (const path of this.eager) {
      const def = getRelation(this.model, path.split(".")[0]);
      columns.add(def.kind === "belongsTo" ? def.foreignKey : def.localKey);
    }
    return [...columns];
  }
}

// ---------------------------------------------------------------------------
// Eager loading
// ---------------------------------------------------------------------------

async function eagerLoad(
  cls: ModelClass,
  parents: any[],
  paths: string[],
): Promise<void> {
  if (parents.length === 0 || paths.length === 0) return;

  // ["posts.comments", "posts.author", "profile"] → posts: [comments, author], profile: []
  const tree = new Map<string, string[]>();
  for (const path of paths) {
    const [head, ...rest] = path.split(".");
    if (!tree.has(head)) tree.set(head, []);
    if (rest.length > 0) tree.get(head)!.push(rest.join("."));
  }

  for (const [name, nested] of tree) {
    const def = getRelation(cls, name);
    const related = def.related() as unknown as ModelClass;
    if (def.kind === "belongsToMany") {
      await loadBelongsToMany(def, related, parents, name, nested);
      continue;
    }
    // belongsTo: parent.foreignKey → related.localKey (owner key)
    // hasMany/hasOne: parent.localKey → related.foreignKey
    const [parentKey, relatedKey] =
      def.kind === "belongsTo"
        ? [def.foreignKey, def.localKey]
        : [def.localKey, def.foreignKey];

    const keys = [
      ...new Set(
        parents
          .map((p) => p[parentKey])
          .filter((k) => k !== null && k !== undefined),
      ),
    ];
    const children: any[] =
      keys.length === 0
        ? []
        : await (new ModelQuery<any>(related) as any)
            .whereIn(relatedKey, keys)
            .with(...nested)
            .get();

    const groups = new Map<unknown, any[]>();
    for (const child of children) {
      const key = child[relatedKey];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(child);
    }
    for (const parent of parents) {
      const matches = groups.get(parent[parentKey]) ?? [];
      parent[name] = def.kind === "hasMany" ? matches : (matches[0] ?? null);
    }
  }
}

const PIVOT_PREFIX = "__pivot_";

/** Many-to-many: one join query through the pivot table per level. */
export async function loadBelongsToMany(
  def: RelationDefinition,
  related: ModelClass,
  parents: any[],
  name: string,
  nested: string[],
): Promise<void> {
  const pivot = def.pivot!;
  const keys = [
    ...new Set(
      parents
        .map((p) => p[def.localKey])
        .filter((k) => k !== null && k !== undefined),
    ),
  ];

  let rows: Record<string, unknown>[] = [];
  if (keys.length > 0) {
    const table = tableOf(related);
    const pivotColumns = [
      ...new Set([def.foreignKey, pivot.relatedPivotKey, ...pivot.columns]),
    ];
    let qb: Builder = getConnection()
      .selectFrom(table)
      .innerJoin(
        pivot.table,
        `${pivot.table}.${pivot.relatedPivotKey}`,
        `${table}.${pivot.relatedKey}`,
      )
      .selectAll(table)
      .select(
        pivotColumns.map((c) => `${pivot.table}.${c} as ${PIVOT_PREFIX}${c}`),
      )
      .where(`${pivot.table}.${def.foreignKey}`, "in", keys);
    if (related.softDeletes) {
      qb = qb.where(`${table}.${related.deletedAt}`, "is", null);
    }
    rows = await qb.execute();
  }

  const children = rows.map((row) => {
    const own: Record<string, unknown> = {};
    const pivotValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith(PIVOT_PREFIX)) {
        pivotValues[key.slice(PIVOT_PREFIX.length)] = value;
      } else {
        own[key] = value;
      }
    }
    const child = hydrate(related, own);
    // Not enumerable, so it is never saved as a column; toJSON() adds it.
    Object.defineProperty(child, "pivot", {
      value: pivotValues,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return child;
  });
  await eagerLoad(related, children, nested);

  const groups = new Map<unknown, any[]>();
  for (const child of children) {
    const key = child.pivot[def.foreignKey];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(child);
  }
  for (const parent of parents) {
    parent[name] = groups.get(parent[def.localKey]) ?? [];
  }
}

export function assertSoftDeletes(cls: ModelClass) {
  if (!cls.softDeletes) {
    throw new Error(
      `[Avleon ORM] ${cls.name} does not use soft deletes. Add \`static readonly softDeletes = true\`.`,
    );
  }
}
