import { snakeCase } from "../utils/names";
import type { MigrationTable } from "./migration-schema";
import { renderField } from "./orm-model";
import { declaredProperties, type Declared } from "./resource";

/**
 * Brings a decorated Megh ORM model's column fields in line with its table as
 * the migrations leave it, for `update:model`. Only the column declarations
 * change: new columns are added (in migration order), dropped ones removed,
 * and fields still in the shape `make:model` writes are rewritten with the
 * current type and nullability. Fields with hand-made changes (a `name:`
 * mapping, a custom cast, extra options or decorators) are kept as written.
 * Relations, methods, statics and comments are left alone.
 */

export interface ModelChanges {
  added: string[];
  removed: string[];
  updated: string[];
  /** Customized fields kept as written although the migration differs. */
  kept: string[];
}

const COLUMN_DECORATOR = /^(Column|PrimaryKey|AutoIncrement|Identity|CreatedAt|UpdatedAt|DeletedAt)\b/;
const DECORATOR_IMPORTS = ["AutoIncrement", "Column", "CreatedAt", "DeletedAt", "Identity", "PrimaryKey", "UpdatedAt"];
/** `@Column({ … })` options `make:model` writes. */
const GENERATED_OPTIONS = new Set(["nullable", "type", "cast"]);

/** The column a field maps to: its `name:` option, else the property name. */
function columnOf(field: Declared): string {
  for (const d of field.decorators) {
    const name = d.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
    if (name) return name;
  }
  return field.name;
}

/** Whether a field still looks the way `make:model` wrote it. */
function isGenerated(field: Declared): boolean {
  if (columnOf(field) !== field.name) return false;
  return field.decorators.every((d) => {
    if (/^(PrimaryKey|AutoIncrement|CreatedAt|UpdatedAt|DeletedAt)\(\s*\)$/.test(d)) return true;
    const column = d.match(/^Column\(\s*(?:\{([^{}]*)\})?\s*\)$/);
    if (!column) return false;
    const keys = [...(column[1] ?? "").matchAll(/([\w$]+)\s*:/g)].map((m) => m[1]);
    return keys.every((k) => GENERATED_OPTIONS.has(k));
  });
}

const normalize = (text: string) => text.replace(/\s+/g, " ").replace(/\s*([(){},:;])\s*/g, "$1").trim();

/** Comment lines directly above `line` (a doc comment for the field). */
function commentAbove(lines: string[], line: number): number {
  let start = line;
  while (start > 0 && /^\s*(\/\/|\/\*|\*)/.test(lines[start - 1])) start--;
  return start;
}

export function syncModelSource(source: string, table: MigrationTable): { source: string; changes: ModelChanges } {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const fields = declaredProperties(source).filter((p) => p.decorators.some((d) => COLUMN_DECORATOR.test(d)));
  const changes: ModelChanges = { added: [], removed: [], updated: [], kept: [] };

  const columnNames = new Set(table.columns.map((c) => c.name));
  const byColumn = new Map(fields.map((f) => [columnOf(f), f]));
  // A property the naming strategy maps to the column: `firstName` ↔ `first_name`.
  const find = (column: string) =>
    byColumn.get(column) ?? fields.find((f) => !columnNames.has(columnOf(f)) && snakeCase(f.name) === column);

  const classLine = lines.findIndex((l) => /\bclass\s+[\w$]+[^{]*\{/.test(l));
  if (classLine === -1 && fields.length === 0) {
    throw new Error("No model class found.");
  }
  const indent = fields.length > 0 ? lines[fields[0].startLine].match(/^\s*/)![0] : "  ";

  const replace = new Map<number, string>(); // first line of a span → its new text
  const drop = new Set<number>(); // lines removed
  const insertAfter = new Map<number, string[]>();
  const used = new Set<Declared>();
  // New columns go after the previous column in migration order.
  let anchor = fields.length > 0 ? commentAbove(lines, fields[0].startLine) - 1 : classLine;

  for (const column of table.columns) {
    const { decorators, field } = renderField(column);
    const fresh = `${decorators.join(" ")} ${field}`;
    const existing = find(column.name);
    if (!existing) {
      insertAfter.set(anchor, [...(insertAfter.get(anchor) ?? []), indent + fresh]);
      changes.added.push(column.name);
      continue;
    }
    used.add(existing);
    anchor = existing.endLine;
    const span = lines.slice(existing.startLine, existing.endLine + 1).join(" ");
    if (normalize(span) === normalize(fresh)) continue;
    if (!isGenerated(existing)) {
      changes.kept.push(column.name);
      continue;
    }
    replace.set(existing.startLine, lines[existing.startLine].match(/^\s*/)![0] + fresh);
    for (let i = existing.startLine + 1; i <= existing.endLine; i++) drop.add(i);
    changes.updated.push(column.name);
  }

  for (const field of fields) {
    if (used.has(field)) continue;
    for (let i = commentAbove(lines, field.startLine); i <= field.endLine; i++) drop.add(i);
    changes.removed.push(columnOf(field));
  }

  const out: string[] = [];
  for (const extra of insertAfter.get(-1) ?? []) out.push(extra);
  lines.forEach((line, i) => {
    if (replace.has(i)) out.push(replace.get(i)!);
    else if (!drop.has(i)) out.push(line);
    for (const extra of insertAfter.get(i) ?? []) out.push(extra);
  });

  return { source: fixImports(out.join(eol)), changes };
}

/** Import the column decorators the model uses from `@meghjs/core`, and drop unused ones. */
function fixImports(source: string): string {
  const match = source.match(/import\s*\{([^}]*)\}\s*from\s*(["'])@meghjs\/core\2\s*;?/);
  if (!match) return source;
  const body = source.slice(match.index! + match[0].length);
  const uses = (name: string) => new RegExp(String.raw`@${name}\s*\(`).test(body);

  const names = match[1]
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const local = (n: string) => n.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
  const kept = names.filter((n) => !DECORATOR_IMPORTS.includes(local(n)) || uses(local(n)));
  const missing = DECORATOR_IMPORTS.filter((d) => uses(d) && !names.some((n) => local(n) === d));
  if (missing.length === 0 && kept.length === names.length) return source;

  const all = [...kept, ...missing];
  // Keep a sorted list sorted (make:model writes one).
  const sorted = names.every((n, i) => i === 0 || local(names[i - 1]).localeCompare(local(n)) <= 0);
  if (sorted) all.sort((a, b) => local(a).localeCompare(local(b)));
  const quote = match[2];
  const statement = `import { ${all.join(", ")} } from ${quote}@meghjs/core${quote};`;
  return source.slice(0, match.index!) + statement + body;
}
