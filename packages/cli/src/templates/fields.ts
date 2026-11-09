import { CliError } from "../errors";
import { pluralize } from "../generators/orm-model";

/**
 * The fields library: column definitions shared by the model templates and
 * the `--fields` option.
 *
 * A field is written as a short spec, `name[?][:type[(args)]][:modifier]...`:
 *
 *   title                         a preset (see FIELD_PRESETS)
 *   email:unique                  a preset with an extra modifier
 *   address?                      a preset group, every column nullable
 *   nickname?:string(50)          an explicit column, nullable
 *   price:money                   a type alias: decimal(12,2)
 *   status:in(draft|published)    the status preset limited to these values
 *   category_id                   a foreign key to `categories` (from the name)
 *   owner_id:foreign(users):cascade
 *
 * Modifiers: `nullable`, `unique`, `index`, `default(value)`, `in(a|b|c)`,
 * and for foreign keys `cascade`, `nullOnDelete` and `restrict`.
 */

/** Megh schema builder column methods a field can use. */
export const COLUMN_TYPES = [
  "string",
  "text",
  "integer",
  "bigInteger",
  "decimal",
  "float",
  "double",
  "boolean",
  "date",
  "datetime",
  "timestamp",
  "time",
  "json",
  "uuid",
  "foreignId",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export type OnDelete = "cascade" | "set null" | "restrict";

export interface FieldDef {
  name: string;
  type: ColumnType;
  /** `string(length)`. */
  length?: number;
  /** `decimal(precision, scale)`. */
  precision?: number;
  scale?: number;
  nullable?: boolean;
  unique?: boolean;
  index?: boolean;
  default?: string | number | boolean;
  /** Allowed values, written next to the column (the column itself is a string). */
  enum?: string[];
  /** Foreign key target, for `foreignId` columns. */
  references?: { table: string; onDelete?: OnDelete };
  /** Written next to the column in the migration. */
  comment?: string;
}

/** Shorthand types: `price:money` is `decimal(12,2)`. */
const TYPE_ALIASES: Record<string, Omit<FieldDef, "name">> = {
  foreign: { type: "foreignId" },
  bigint: { type: "bigInteger" },
  int: { type: "integer" },
  bool: { type: "boolean" },
  money: { type: "decimal", precision: 12, scale: 2 },
  percent: { type: "decimal", precision: 5, scale: 2 },
  email: { type: "string", length: 255 },
  phone: { type: "string", length: 32 },
  url: { type: "string", length: 2048 },
};

type Preset = Omit<FieldDef, "name"> & { name?: string };

const str = (length = 255, extra: Partial<FieldDef> = {}): Preset => ({ type: "string", length, ...extra });
const money = (extra: Partial<FieldDef> = {}): Preset => ({ type: "decimal", precision: 12, scale: 2, ...extra });
const opt = (preset: Preset): Preset => ({ ...preset, nullable: true });

/**
 * Columns used across models, by the name they are written as. A preset is
 * one column, or a group of columns (`address`, `geo`, `person`).
 */
export const FIELD_PRESETS: Record<string, Preset | Record<string, Preset>> = {
  // Names and text
  name: str(),
  title: str(),
  slug: str(255, { unique: true }),
  code: str(32, { unique: true }),
  sku: str(64, { unique: true }),
  reference: str(64, { unique: true }),
  description: opt({ type: "text" }),
  notes: opt({ type: "text" }),
  body: { type: "text" },
  summary: opt(str(500)),
  first_name: str(100),
  last_name: str(100),
  middle_name: opt(str(100)),
  username: str(64, { unique: true }),
  // Contact
  email: str(255),
  phone: opt(str(32)),
  mobile: opt(str(32)),
  website: opt(str(2048)),
  url: opt(str(2048)),
  image: opt(str(2048)),
  avatar: opt(str(2048)),
  logo: opt(str(2048)),
  // Auth
  password: str(255),
  remember_token: opt(str(100)),
  email_verified_at: opt({ type: "timestamp" }),
  last_login_at: opt({ type: "timestamp" }),
  // State
  status: str(32, { default: "active", index: true }),
  type: str(32, { index: true }),
  priority: str(16, { default: "normal", enum: ["low", "normal", "high", "urgent"] }),
  is_active: { type: "boolean", default: true },
  is_featured: { type: "boolean", default: false },
  sort_order: { type: "integer", default: 0 },
  color: opt(str(32)),
  rating: { type: "integer", default: 0 },
  // Money and quantities
  price: money(),
  cost: money({ nullable: true }),
  amount: money(),
  subtotal: money({ default: 0 }),
  discount: money({ default: 0 }),
  tax: money({ default: 0 }),
  total: money({ default: 0 }),
  balance: money({ default: 0 }),
  tax_rate: { type: "decimal", precision: 5, scale: 2, default: 0 },
  currency: str(3, { default: "USD" }),
  quantity: { type: "integer", default: 1 },
  stock: { type: "integer", default: 0 },
  weight: { type: "decimal", precision: 10, scale: 3, nullable: true },
  // People
  gender: opt(str(16, { enum: ["male", "female", "other"] })),
  date_of_birth: opt({ type: "date" }),
  national_id: opt(str(64)),
  // Dates
  date: { type: "date" },
  due_date: opt({ type: "date" }),
  starts_at: opt({ type: "timestamp" }),
  ends_at: opt({ type: "timestamp" }),
  published_at: opt({ type: "timestamp" }),
  paid_at: opt({ type: "timestamp" }),
  // Other
  uuid: { type: "uuid", unique: true },
  ip_address: opt(str(45)),
  metadata: opt({ type: "json" }),
  settings: opt({ type: "json" }),
  // Groups
  address: {
    address_line1: str(),
    address_line2: opt(str()),
    city: str(100),
    state: opt(str(100)),
    postal_code: opt(str(20)),
    country: str(100),
  },
  geo: {
    latitude: { type: "decimal", precision: 10, scale: 7, nullable: true },
    longitude: { type: "decimal", precision: 10, scale: 7, nullable: true },
  },
  person: {
    first_name: str(100),
    last_name: str(100),
  },
};

const isGroup = (p: Preset | Record<string, Preset>): p is Record<string, Preset> =>
  typeof (p as Preset).type !== "string";

/** Split on `sep` outside parentheses. */
function splitTop(spec: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === sep && depth === 0) {
      out.push(spec.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(spec.slice(start).trim());
  return out.filter((s) => s !== "");
}

/** `money(10, 2)` → `{ head: "money", args: ["10", "2"] }`. */
function call(segment: string): { head: string; args: string[] } {
  const m = segment.match(/^(\w+)\s*(?:\((.*)\))?$/s);
  if (!m) throw new CliError(`Invalid field part "${segment}".`);
  return { head: m[1], args: m[2] === undefined ? [] : m[2].split(/[,|]/).map((a) => a.trim()) };
}

function parseValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw.replace(/^["']|["']$/g, "");
}

/** Model instance members a column would shadow. */
const RESERVED = new Set(["key", "save", "fill", "delete", "restore", "related", "constructor"]);

const MODIFIERS = new Set(["nullable", "unique", "index", "default", "in", "cascade", "nullOnDelete", "restrict"]);

function applyModifier(field: FieldDef, segment: string, spec: string) {
  const { head, args } = call(segment);
  switch (head) {
    case "nullable":
      field.nullable = true;
      return;
    case "unique":
      field.unique = true;
      return;
    case "index":
      field.index = true;
      return;
    case "default":
      if (args.length === 0) throw new CliError(`"${spec}": default needs a value, e.g. default(0).`);
      field.default = parseValue(args.join(","));
      return;
    case "in":
      if (args.length === 0) throw new CliError(`"${spec}": in needs values, e.g. in(draft|published).`);
      field.enum = args;
      if (field.type !== "string") Object.assign(field, { type: "string", length: 32 });
      return;
    case "cascade":
    case "nullOnDelete":
    case "restrict": {
      if (field.type !== "foreignId") throw new CliError(`"${spec}": ${head} only applies to foreign keys.`);
      const onDelete: OnDelete = head === "cascade" ? "cascade" : head === "restrict" ? "restrict" : "set null";
      field.references = { ...field.references!, onDelete };
      if (onDelete === "set null") field.nullable = true;
      return;
    }
    default:
      throw new CliError(
        `"${spec}": unknown modifier "${head}". Use nullable, unique, index, default(x), in(a|b), cascade, nullOnDelete or restrict.`,
      );
  }
}

/** The column for `name:type(args)`. */
function typedField(name: string, segment: string, spec: string): FieldDef {
  const { head, args } = call(segment);
  const alias = TYPE_ALIASES[head];
  const type = (alias?.type ?? head) as ColumnType;
  if (!alias && !(COLUMN_TYPES as readonly string[]).includes(head)) {
    throw new CliError(
      `"${spec}": unknown type "${head}". Use one of: ${[...COLUMN_TYPES, ...Object.keys(TYPE_ALIASES)].join(", ")}.`,
    );
  }
  const field: FieldDef = { ...alias, name, type };
  const num = (i: number) => {
    const n = Number(args[i]);
    if (!Number.isInteger(n) || n <= 0) throw new CliError(`"${spec}": "${args[i]}" is not a positive integer.`);
    return n;
  };
  if (type === "string" && args.length) field.length = num(0);
  if (type === "decimal" && args.length) {
    field.precision = num(0);
    field.scale = args[1] === undefined ? 2 : Number(args[1]);
  }
  if (type === "foreignId") {
    field.references = { table: args[0] || foreignTable(name) };
  }
  return field;
}

/** `category_id` → `categories`. */
export function foreignTable(column: string): string {
  return pluralize(column.replace(/_id$/, ""));
}

/**
 * Parse one field spec into its columns (a preset group gives several).
 * Throws a CliError explaining what is wrong.
 */
export function parseFieldSpec(spec: string): FieldDef[] {
  const parts = splitTop(spec.trim(), ":");
  if (parts.length === 0) throw new CliError("Empty field spec.");
  const rawName = parts[0];
  const nullable = rawName.endsWith("?");
  const name = rawName.replace(/\?$/, "");
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new CliError(`"${spec}": field names are snake_case, e.g. first_name.`);
  }
  if (RESERVED.has(name)) {
    throw new CliError(`"${spec}": "${name}" is a Model method, so it can't be a column. Use another name, e.g. ${name}_value.`);
  }

  let rest = parts.slice(1);
  let fields: FieldDef[];
  const next = rest[0] ? call(rest[0]).head : undefined;
  if (next && !MODIFIERS.has(next)) {
    fields = [typedField(name, rest[0], spec)];
    rest = rest.slice(1);
  } else if (FIELD_PRESETS[name]) {
    const preset = FIELD_PRESETS[name];
    fields = isGroup(preset)
      ? Object.entries(preset).map(([n, p]) => ({ ...p, name: n }) as FieldDef)
      : [{ ...preset, name } as FieldDef];
  } else if (/_id$/.test(name)) {
    fields = [{ name, type: "foreignId", references: { table: foreignTable(name) } }];
  } else if (rest.some((s) => call(s).head === "in")) {
    // `kind:in(a|b)` needs no type: a short string column.
    fields = [{ name, type: "string", length: 32 }];
  } else {
    throw new CliError(`"${spec}": "${name}" is not a field preset, so give it a type, e.g. ${name}:string.`);
  }

  const explicitDefault = rest.some((s) => call(s).head === "default");
  for (const field of fields) {
    if (nullable) field.nullable = true;
    for (const segment of rest) applyModifier(field, segment, spec);
    // A preset's default (status: "active") becomes the first allowed value,
    // as does an explicit default outside them.
    if (field.enum && field.default !== undefined) {
      if (!explicitDefault || !field.enum.includes(String(field.default))) field.default = field.enum[0];
    }
  }
  return fields;
}

/** Parse a comma-separated `--fields` list. */
export function parseFieldList(list: string | string[]): FieldDef[] {
  const specs = Array.isArray(list) ? list : splitTop(list, ",");
  return specs.flatMap((s) => splitTop(s, ",")).flatMap(parseFieldSpec);
}

/** `base` with `extra` fields added; a field of the same name replaces the template's. */
export function mergeFields(base: FieldDef[], extra: FieldDef[]): FieldDef[] {
  const out = base.map((f) => ({ ...f }));
  for (const field of extra) {
    const i = out.findIndex((f) => f.name === field.name);
    if (i === -1) out.push(field);
    else out[i] = field;
  }
  return out;
}
