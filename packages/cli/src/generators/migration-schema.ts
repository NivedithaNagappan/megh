import fs from "fs";
import path from "path";

/**
 * Reads table schemas out of migration files, without running them: the
 * `up()` code of every migration is scanned, in file order, and its schema
 * changes are replayed. Used by `make:model` to declare a model's columns.
 *
 * It understands Megh's schema builder (`defineMigration`, with
 * `schema.create` / `schema.table` / `schema.drop`), and Kysely's
 * `createTable` / `alterTable` / `dropTable` chains in older migrations.
 * Anything it cannot read (raw SQL, computed names) is skipped.
 */

export interface MigrationColumn {
  name: string;
  /** Data type as written, lower-cased, e.g. `"varchar(255)"`; `""` when not a literal. */
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  /** The database fills it in: auto-increment, identity, serial or a default. */
  generated: boolean;
  /** Auto-increment / identity / serial (as opposed to a default value). */
  autoIncrement: boolean;
}

export interface MigrationTable {
  name: string;
  columns: MigrationColumn[];
  /** Migration that created the table (file name). */
  createdIn: string;
}

const EXTENSIONS = /\.(c?js|mjs|c?ts|mts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;

/** Every table the migrations in `folder` leave behind, keyed by name. */
export function readMigrationSchema(folder: string): Map<string, MigrationTable> {
  const tables = new Map<string, MigrationTable>();
  if (!fs.existsSync(folder)) return tables;
  const files = fs
    .readdirSync(folder)
    .filter((f) => EXTENSIONS.test(f) && !DECLARATION.test(f))
    .sort();
  for (const file of files) {
    applyMigration(tables, upSource(fs.readFileSync(path.join(folder, file), "utf8")), file);
  }
  return tables;
}

/** The `up()` part of a migration: everything before `down`. */
function upSource(source: string): string {
  const code = stripComments(source);
  const down = code.search(/\b(?:function\s+down\b|down\s*[:=(])/);
  return down === -1 ? code : code.slice(0, down);
}

/** Drop `//` and `/* *\/` comments, keeping string contents intact. */
function stripComments(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(source, i);
      out += source.slice(i, end + 1);
      i = end;
    } else if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Index of the closing quote of the string starting at `start`. */
function skipString(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return text.length - 1;
}

/** The text between the `(` at `open` and its matching `)`, and the index after it. */
function readCall(text: string, open: number): { inner: string; end: number } {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") i = skipString(text, i);
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return { inner: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return { inner: text.slice(open + 1), end: text.length };
}

/** Split call arguments on top-level commas. */
function splitArgs(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"' || ch === "'" || ch === "`") i = skipString(inner, i);
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      args.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) args.push(last);
  return args;
}

/** The value of a plain string literal (no `${}`), else `undefined`. */
function literal(arg: string | undefined): string | undefined {
  const m = arg?.match(/^(["'`])((?:\\.|(?!\1).)*)\1$/s);
  if (!m || (m[1] === "`" && m[2].includes("${"))) return undefined;
  return m[2];
}

/** The value of a plain number literal, else `undefined`. */
function literalNumber(arg: string | undefined): number | undefined {
  return arg !== undefined && /^\d+$/.test(arg.trim()) ? Number(arg.trim()) : undefined;
}

/** A column data type argument: `"text"`, `sql\`varchar(255)\``, … */
function dataType(arg: string | undefined): string {
  if (!arg) return "";
  const plain = literal(arg);
  if (plain !== undefined) return plain.trim().toLowerCase();
  const raw = arg.match(/^sql(?:\.raw)?\s*(?:`([^`$]*)`|\(\s*["'`]([^"'`$]*)["'`]\s*\))$/);
  return (raw?.[1] ?? raw?.[2] ?? "").trim().toLowerCase();
}

/** Table name without a schema prefix: `public.users` → `users`. */
function tableName(arg: string | undefined): string | undefined {
  const name = literal(arg);
  return name?.split(".").pop();
}

const STATEMENT = /\.(createTable|alterTable|dropTable)\s*\(/g;
const COLUMN_CALL =
  /\.(addColumn|modifyColumn|dropColumn|renameColumn|alterColumn|renameTo|addPrimaryKeyConstraint)\s*\(/g;

function applyMigration(tables: Map<string, MigrationTable>, code: string, file: string) {
  if (/\bdefineMigration\s*\(/.test(code)) {
    applySchemaMigration(tables, code, file);
    return;
  }
  const statements = [...code.matchAll(STATEMENT)];
  statements.forEach((match, index) => {
    const open = match.index! + match[0].length - 1;
    const { inner, end } = readCall(code, open);
    const name = tableName(splitArgs(inner)[0]);
    if (!name) return;
    const kind = match[1];
    if (kind === "dropTable") {
      tables.delete(name);
      return;
    }
    // The chain runs until the next schema statement.
    const chainEnd = index + 1 < statements.length ? statements[index + 1].index! : code.length;
    const chain = code.slice(end, chainEnd);
    let table = tables.get(name);
    if (kind === "createTable") {
      table = { name, columns: [], createdIn: file };
      tables.set(name, table);
    }
    if (table) applyChain(tables, table, chain);
  });
}

function applyChain(tables: Map<string, MigrationTable>, table: MigrationTable, chain: string) {
  for (const match of chain.matchAll(COLUMN_CALL)) {
    const open = match.index! + match[0].length - 1;
    const args = splitArgs(readCall(chain, open).inner);
    const name = literal(args[0]);
    const index = name === undefined ? -1 : table.columns.findIndex((c) => c.name === name);

    switch (match[1]) {
      case "addColumn":
      case "modifyColumn": {
        if (name === undefined) break;
        const column = parseColumn(name, args[1], args[2] ?? "");
        if (index === -1) table.columns.push(column);
        else table.columns[index] = column;
        break;
      }
      case "dropColumn":
        if (index !== -1) table.columns.splice(index, 1);
        break;
      case "renameColumn": {
        const to = literal(args[1]);
        if (index !== -1 && to) table.columns[index] = { ...table.columns[index], name: to };
        break;
      }
      case "alterColumn": {
        if (index === -1) break;
        const column = table.columns[index];
        const change = args[1] ?? "";
        const setType = change.match(/\.setDataType\s*\(([^)]*)\)/);
        if (setType) column.type = dataType(setType[1].trim());
        if (/\.setNotNull\s*\(/.test(change)) column.notNull = true;
        if (/\.dropNotNull\s*\(/.test(change)) column.notNull = false;
        if (/\.setDefault\s*\(/.test(change)) column.generated = true;
        if (/\.dropDefault\s*\(/.test(change)) column.generated = column.autoIncrement;
        break;
      }
      case "renameTo": {
        if (name === undefined) break;
        tables.delete(table.name);
        table.name = name;
        tables.set(name, table);
        break;
      }
      case "addPrimaryKeyConstraint": {
        const columns = (args[1]?.match(/["'`][^"'`]+["'`]/g) ?? []).map((c) => c.slice(1, -1));
        for (const column of table.columns) {
          if (columns.includes(column.name)) {
            column.primaryKey = true;
            column.notNull = true;
          }
        }
        break;
      }
    }
  }
}

function parseColumn(name: string, typeArg: string | undefined, build: string): MigrationColumn {
  const type = dataType(typeArg);
  const autoIncrement =
    /\.(autoIncrement|identity|generatedAlwaysAsIdentity|generatedByDefaultAsIdentity)\s*\(/.test(build) ||
    /^(small|big)?serial\d?$/.test(type);
  const primaryKey = /\.primaryKey\s*\(/.test(build);
  return {
    name,
    type,
    notNull: primaryKey || autoIncrement || /\.notNull\s*\(/.test(build),
    primaryKey,
    autoIncrement,
    generated: autoIncrement || /\.(defaultTo|generatedAlwaysAs)\s*\(/.test(build),
  };
}

// ── Megh's schema builder (defineMigration) ──────────────────────────────

const SCHEMA_STATEMENT = /\b\w+\s*\.\s*(create|table|drop|dropIfExists|rename)\s*\(/g;

/** SQL types the builder's column methods create, as `fieldType` reads them. */
const BUILDER_TYPES: Record<string, string> = {
  id: "integer",
  increments: "integer",
  bigIncrements: "bigint",
  string: "varchar",
  text: "text",
  integer: "integer",
  bigInteger: "bigint",
  float: "real",
  double: "double precision",
  decimal: "numeric",
  boolean: "boolean",
  date: "date",
  datetime: "timestamp",
  timestamp: "timestamptz",
  time: "time",
  json: "json",
  uuid: "uuid",
  binary: "blob",
  foreignId: "integer",
};

function applySchemaMigration(tables: Map<string, MigrationTable>, code: string, file: string) {
  for (const match of code.matchAll(SCHEMA_STATEMENT)) {
    const open = match.index! + match[0].length - 1;
    const args = splitArgs(readCall(code, open).inner);
    const name = tableName(args[0]);
    if (!name) continue;
    switch (match[1]) {
      case "drop":
      case "dropIfExists":
        tables.delete(name);
        break;
      case "rename": {
        const to = tableName(args[1]);
        const table = tables.get(name);
        if (!to || !table) break;
        tables.delete(name);
        table.name = to;
        tables.set(to, table);
        break;
      }
      case "create": {
        const table: MigrationTable = { name, columns: [], createdIn: file };
        tables.set(name, table);
        applyBlueprint(table, args[1]);
        break;
      }
      case "table": {
        const table = tables.get(name);
        if (table) applyBlueprint(table, args[1]);
        break;
      }
    }
  }
}

/** Replay the calls in `(table) => { … }` on `table`. */
function applyBlueprint(table: MigrationTable, callback: string | undefined) {
  const head = callback?.match(/^(?:async\s+)?\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^)=]*)?\)?\s*=>/);
  if (!callback || !head) return;
  const param = head[1].replace(/[$]/g, String.raw`\$`);
  const body = callback.slice(head[0].length);
  const calls = [...body.matchAll(new RegExp(String.raw`(?<![\w$.])${param}\s*\.\s*(\w+)\s*\(`, "g"))];
  calls.forEach((call, i) => {
    const open = call.index! + call[0].length - 1;
    const { inner, end } = readCall(body, open);
    const args = splitArgs(inner);
    // Modifiers run until the next call on the blueprint.
    const chain = body.slice(end, i + 1 < calls.length ? calls[i + 1].index! : body.length);
    applyBlueprintCall(table, call[1], args, chain);
  });
}

function setColumn(table: MigrationTable, column: MigrationColumn) {
  const index = table.columns.findIndex((c) => c.name === column.name);
  if (index === -1) table.columns.push(column);
  else table.columns[index] = column;
}

function applyBlueprintCall(table: MigrationTable, method: string, args: string[], chain: string) {
  const name = literal(args[0]);
  const drop = (column: string) => {
    const index = table.columns.findIndex((c) => c.name === column);
    if (index !== -1) table.columns.splice(index, 1);
  };

  switch (method) {
    case "timestamps":
      for (const column of ["created_at", "updated_at"]) {
        setColumn(table, { name: column, type: "timestamptz", notNull: false, primaryKey: false, generated: false, autoIncrement: false });
      }
      return;
    case "softDeletes":
      setColumn(table, {
        name: name ?? "deleted_at",
        type: "timestamptz",
        notNull: false,
        primaryKey: false,
        generated: false,
        autoIncrement: false,
      });
      return;
    case "dropColumn":
      for (const arg of args) {
        const column = literal(arg);
        if (column) drop(column);
      }
      return;
    case "dropTimestamps":
      drop("created_at");
      drop("updated_at");
      return;
    case "dropSoftDeletes":
      drop(name ?? "deleted_at");
      return;
    case "renameColumn": {
      const to = literal(args[1]);
      const column = table.columns.find((c) => c.name === name);
      if (column && to) column.name = to;
      return;
    }
    case "primary": {
      const columns = (args[0]?.match(/["'`][^"'`]+["'`]/g) ?? []).map((c) => c.slice(1, -1));
      for (const column of table.columns) {
        if (columns.includes(column.name)) {
          column.primaryKey = true;
          column.notNull = true;
        }
      }
      return;
    }
  }

  const builderType = BUILDER_TYPES[method];
  if (!builderType) return;
  // string(name, length = 255) is a varchar(length) column.
  const type = method === "string" ? `varchar(${Number(literalNumber(args[1]) ?? 255)})` : builderType;
  const columnName = name ?? (method === "id" ? "id" : undefined);
  if (!columnName) return;
  const autoIncrement = /^(id|increments|bigIncrements)$/.test(method) || /\.autoIncrement\s*\(/.test(chain);
  const primaryKey = autoIncrement || /\.primary\s*\(/.test(chain);
  const nullable = /\.nullable\s*\(\s*(true)?\s*\)/.test(chain) || /\.nullOnDelete\s*\(/.test(chain);
  setColumn(table, {
    name: columnName,
    type,
    notNull: primaryKey || !nullable,
    primaryKey,
    autoIncrement,
    generated: autoIncrement || /\.(default|useCurrent)\s*\(/.test(chain),
  });
}
