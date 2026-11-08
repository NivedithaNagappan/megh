/**
 * Decorators that describe a model's table, columns and relations:
 *
 * ```ts
 * @Table("users")
 * class User extends Model {
 *   @PrimaryKey() @AutoIncrement() id: number;
 *   @Column({ unique: true }) email: string;
 *   @Column({ type: "json", nullable: true }) settings: Settings | null;
 *   @CreatedAt() created_at?: Date;
 *
 *   @HasMany(() => Post) posts?: Post[];
 * }
 * ```
 *
 * They record metadata (also used later to build schemas) and set the
 * model's static settings (`table`, `primaryKey`, `generated`, …), which the
 * rest of the ORM reads. Models written with static fields keep working.
 */
import type { Cast } from "./casts";
import {
  declareRelation,
  snakeCase,
  type BelongsToManyOptions,
  type DeclaredRelation,
} from "./relations";
import type * as relations from "./relations";

// Each relation decorator shares its name with a field type. Typing the field
// with the related model (`Post[]`, `User | null`) works too; many-to-many
// keeps BelongsToMany<M, Pivot> for its pivot columns and attach/detach.
/** A one-to-many relation field. Loads as `M[]`. */
export type HasMany<M> = relations.HasMany<M>;
/** A one-to-one relation field. Loads as `M | null`. */
export type HasOne<M> = relations.HasOne<M>;
/** The inverse side of HasMany/HasOne. Loads as `M | null`. */
export type BelongsTo<M> = relations.BelongsTo<M>;
/** A many-to-many relation field. Loads as `M[]`, each with `pivot`. */
export type BelongsToMany<M, Pivot = {}> = relations.BelongsToMany<M, Pivot>;

/** Column types. They pick the SQL type in schemas and the value conversion. */
export type ColumnType =
  | "string"
  | "text"
  | "integer"
  | "bigint"
  | "float"
  | "double"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "timestamp"
  | "time"
  | "json"
  | "uuid"
  | "binary";

export interface ColumnOptions {
  /**
   * The column's name in the database, when it differs from the property:
   * `@Column({ name: "created_at" }) createdAt`. Without it, the naming
   * strategy decides (`useMeghORM({ naming: "snake_case" })`).
   */
  name?: string;
  /** Column type. When left out, `boolean` and `Date` fields are read from the TypeScript type. */
  type?: ColumnType;
  /** Allows NULL. */
  nullable?: boolean;
  unique?: boolean;
  /** Default value the database fills in. */
  default?: unknown;
  /** Maximum length, for `string`. */
  length?: number;
  /** Total digits, for `decimal`. */
  precision?: number;
  /** Digits after the decimal point, for `decimal`. */
  scale?: number;
  /** How stored values convert to model values. Defaults from `type`. */
  cast?: Cast;
}

export interface ColumnMetadata extends ColumnOptions {
  property: string;
  primary?: boolean;
  /** Filled in by the database: an auto-increment or identity column. */
  generated?: "increment";
}

export interface ModelMetadata {
  table?: string;
  columns: Map<string, ColumnMetadata>;
  relations: Map<string, DeclaredRelation>;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

const metadata = new WeakMap<Function, ModelMetadata>();

function own(cls: Function): ModelMetadata {
  let meta = metadata.get(cls);
  if (!meta) {
    meta = { columns: new Map(), relations: new Map() };
    metadata.set(cls, meta);
  }
  return meta;
}

/**
 * A class's metadata merged with its parents', or `undefined` when neither
 * it nor a parent uses decorators.
 */
export function getModelMetadata(cls: Function): ModelMetadata | undefined {
  const chain: ModelMetadata[] = [];
  for (
    let c: any = cls;
    c && c !== Function.prototype;
    c = Object.getPrototypeOf(c)
  ) {
    const meta = metadata.get(c);
    if (meta) chain.unshift(meta);
  }
  if (chain.length === 0) return undefined;
  const merged: ModelMetadata = { columns: new Map(), relations: new Map() };
  for (const meta of chain) {
    for (const [k, v] of meta.columns) merged.columns.set(k, v);
    for (const [k, v] of meta.relations) merged.relations.set(k, v);
    merged.createdAt = meta.createdAt ?? merged.createdAt;
    merged.updatedAt = meta.updatedAt ?? merged.updatedAt;
    merged.deletedAt = meta.deletedAt ?? merged.deletedAt;
  }
  merged.table = metadata.get(cls)?.table;
  return merged;
}

const DEFAULT_CASTS: Partial<Record<ColumnType, Cast>> = {
  boolean: "boolean",
  json: "json",
  date: "date",
  datetime: "datetime",
  timestamp: "datetime",
};

/** Casts declared on columns (`type: "json"`, `cast: …`). */
export function columnCasts(cls: Function): Record<string, Cast> {
  const out: Record<string, Cast> = {};
  for (const column of getModelMetadata(cls)?.columns.values() ?? []) {
    const cast =
      column.cast ?? (column.type ? DEFAULT_CASTS[column.type] : undefined);
    if (cast) out[column.property] = cast;
  }
  return out;
}

/** Decorated column names, or `undefined` for models without column decorators. */
export function columnNames(cls: Function): string[] | undefined {
  const columns = getModelMetadata(cls)?.columns;
  return columns && columns.size > 0 ? [...columns.keys()] : undefined;
}

function define(cls: Function, name: string, value: unknown) {
  Object.defineProperty(cls, name, {
    value,
    writable: false,
    enumerable: true,
    configurable: true,
  });
}

/** Set the static settings the ORM reads from the decorator metadata. */
function sync(cls: Function) {
  const meta = getModelMetadata(cls)!;
  if (meta.table) define(cls, "table", meta.table);

  const columns = [...meta.columns.values()];
  const primary = columns.find((c) => c.primary);
  if (primary) define(cls, "primaryKey", primary.property);
  const generated = columns.filter((c) => c.generated).map((c) => c.property);
  if (generated.length) define(cls, "generated", generated);

  if (meta.createdAt || meta.updatedAt) {
    define(cls, "timestamps", true);
    define(cls, "createdAt", meta.createdAt ?? null);
    define(cls, "updatedAt", meta.updatedAt ?? null);
  }
  if (meta.deletedAt) {
    define(cls, "softDeletes", true);
    define(cls, "deletedAt", meta.deletedAt);
  }
}

/** The column type TypeScript emitted for a field, when it maps to one. */
function typeFromMetadata(prototype: object, property: string) {
  const getMetadata = (Reflect as any).getMetadata;
  if (typeof getMetadata !== "function") return undefined;
  const type = getMetadata("design:type", prototype, property);
  if (type === Boolean) return "boolean";
  if (type === Date) return "datetime";
  return undefined;
}

type FieldDecorator = (prototype: object, property: string | symbol) => void;

function updateColumn(
  prototype: object,
  property: string | symbol,
  change: Partial<ColumnMetadata>,
) {
  if (typeof property !== "string") {
    throw new Error("[Megh ORM] Columns must have string names.");
  }
  const cls = prototype.constructor;
  const columns = own(cls).columns;
  const current = columns.get(property) ?? {
    property,
    type: typeFromMetadata(prototype, property),
  };
  columns.set(property, { ...current, ...stripUndefined(change) });
  sync(cls);
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * The model's table. Without a name it's the plural snake_case class name:
 * `BlogPost` → `blog_posts`.
 */
export function Table(name?: string): ClassDecorator {
  return (target) => {
    own(target).table = name ?? pluralize(snakeCase(target.name));
    sync(target);
  };
}

/** A column. `@Column()`, `@Column("text")` or `@Column({ type, nullable, … })`. */
export function Column(
  typeOrOptions?: ColumnType | ColumnOptions,
  options: ColumnOptions = {},
): FieldDecorator {
  const resolved =
    typeof typeOrOptions === "string"
      ? { ...options, type: typeOrOptions }
      : { ...typeOrOptions };
  return (prototype, property) => updateColumn(prototype, property, resolved);
}

/** The primary key column. Defaults to `id` when no field has it. */
export function PrimaryKey(options: ColumnOptions = {}): FieldDecorator {
  return (prototype, property) =>
    updateColumn(prototype, property, { ...options, primary: true });
}

/**
 * A column the database numbers itself: `SERIAL`/`IDENTITY` on Postgres,
 * `AUTO_INCREMENT` on MySQL, `IDENTITY(1,1)` on SQL Server, `AUTOINCREMENT`
 * on SQLite. It's left out of inserts and optional in `create()`.
 */
export function AutoIncrement(): FieldDecorator {
  return (prototype, property) =>
    updateColumn(prototype, property, {
      generated: "increment",
      type: "integer",
    });
}

/** Same as {@link AutoIncrement}; the name SQL Server and Entity Framework use. */
export const Identity = AutoIncrement;

function timestampColumn(
  key: "createdAt" | "updatedAt" | "deletedAt",
  nullable: boolean,
): (options?: { name?: string }) => FieldDecorator {
  return (options = {}) =>
    (prototype, property) => {
      if (typeof property !== "string") return;
      own(prototype.constructor)[key] = property;
      updateColumn(prototype, property, {
        type: "datetime",
        name: options.name,
        ...(nullable ? { nullable: true } : {}),
      });
    };
}

/** Set to the current time when the row is inserted. */
export const CreatedAt = timestampColumn("createdAt", false);
/** Set to the current time on every insert and update. */
export const UpdatedAt = timestampColumn("updatedAt", false);
/**
 * Soft deletes: `delete()` sets this column instead of removing the row, and
 * queries skip such rows unless `withTrashed()` / `onlyTrashed()` is used.
 */
export const DeletedAt = timestampColumn("deletedAt", true);

type RelatedClass = abstract new () => any;

function relation(def: DeclaredRelation): FieldDecorator {
  return (prototype, property) => {
    if (typeof property !== "string") return;
    own(prototype.constructor).relations.set(property, def);
  };
}

export interface HasOptions {
  /** Column on the related table. Defaults to `<snake_case this class>_id`. */
  foreignKey?: string;
  /** Key on this table it matches. Defaults to the primary key. */
  localKey?: string;
}

export interface BelongsToOptions {
  /** Column on this table. Defaults to `<snake_case field>_id`. */
  foreignKey?: string;
  /** Key on the related table. Defaults to its primary key. */
  ownerKey?: string;
}

/** One-to-many. Type the field `Post[]` (or `HasMany<Post>`); it loads as `Post[]`. */
export function HasMany<C extends RelatedClass>(
  related: () => C,
  options: HasOptions = {},
): FieldDecorator {
  return relation(declareRelation("hasMany", related, options));
}

/** One-to-one. Type the field `Profile | null` (or `HasOne<Profile>`). */
export function HasOne<C extends RelatedClass>(
  related: () => C,
  options: HasOptions = {},
): FieldDecorator {
  return relation(declareRelation("hasOne", related, options));
}

/** The inverse of HasMany/HasOne. Type the field `User | null` (or `BelongsTo<User>`). */
export function BelongsTo<C extends RelatedClass>(
  related: () => C,
  options: BelongsToOptions = {},
): FieldDecorator {
  return relation(
    declareRelation("belongsTo", related, {
      foreignKey: options.foreignKey,
      localKey: options.ownerKey,
    }),
  );
}

export interface BelongsToManyDecoratorOptions extends BelongsToManyOptions {
  /** Extra pivot columns to load into each related row's `pivot`. */
  pivotColumns?: string[];
}

/**
 * Many-to-many through a pivot table. Type the field
 * `BelongsToMany<Role>` (or `BelongsToMany<Role, { granted_at: Date }>`
 * with `pivotColumns`).
 */
export function BelongsToMany<C extends RelatedClass>(
  related: () => C,
  options: BelongsToManyDecoratorOptions = {},
): FieldDecorator {
  const { pivotColumns = [], ...pivot } = options;
  return relation(
    declareRelation("belongsToMany", related, {
      pivot: { ...pivot, columns: [...pivotColumns] },
    }),
  );
}

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
