import type { MigrationColumn, MigrationTable } from "./migration-schema";
import { fieldType } from "./orm-model";
import { renderStub } from "../utils/stubs";

/**
 * What `make:resource` needs to know about a model to write its DTOs,
 * service and controller: read from the model's source, and refined with its
 * table's migration when there is one (for `varchar(n)` lengths and integer
 * vs. decimal columns).
 */

export interface ResourceField {
  name: string;
  /** TypeScript type without `| null`, e.g. `string`, `Date`. */
  ts: string;
  nullable: boolean;
  /** The database fills it in (`static generated`), so `create()` may leave it out. */
  generated: boolean;
  /** SQL type from the migration, when known. */
  sqlType?: string;
}

export interface ResourceSchema {
  /** `megh` for `extends Model`, `typeorm` for an `@Entity` class. */
  kind: "megh" | "typeorm";
  /** `static table`, if the model declares one. */
  table?: string;
  primaryKey: string;
  /** TypeScript type of the primary key. */
  primaryKeyType: string;
  /** Columns a client may send when creating or updating a row. */
  inputFields: ResourceField[];
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The string value of `static readonly <name> = "..."`. */
function staticString(source: string, name: string): string | undefined {
  return source.match(new RegExp(`static\\s+(?:readonly\\s+)?${name}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`))?.[1];
}

function staticTrue(source: string, name: string): boolean {
  return new RegExp(`static\\s+(?:readonly\\s+)?${name}\\s*=\\s*true\\b`).test(source);
}

/** `static generated = [...]` as a list, or `undefined` when not declared. */
function staticList(source: string, name: string): string[] | undefined {
  const m = source.match(new RegExp(`static\\s+(?:readonly\\s+)?${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) return undefined;
  return (m[1].match(/["'`][^"'`]+["'`]/g) ?? []).map((s) => s.slice(1, -1));
}

export interface Declared {
  name: string;
  ts: string;
  /** `| null`, `| undefined` or `?`. */
  nullable: boolean;
  /** Declared with `?`. */
  optional: boolean;
  /** `| null` or `| undefined` in the type. */
  nullInType: boolean;
  decorators: string[];
  /** First line (0-based) of the declaration, including its decorators. */
  startLine: number;
  /** Line (0-based) of the property itself. */
  endLine: number;
}

/** Split leading decorators off a line: `@PrimaryKey() @AutoIncrement() id?: number;`. */
function leadingDecorators(line: string): { decorators: string[]; rest: string } {
  const decorators: string[] = [];
  let rest = line;
  for (;;) {
    const head = rest.match(/^@(\w+)\s*/);
    if (!head) break;
    let end = head[0].length;
    if (rest[end] === "(") {
      // Up to the matching ")", or the end of the line for a decorator that
      // continues on the next lines.
      end = rest.length;
      let depth = 0;
      for (let i = head[0].length; i < rest.length; i++) {
        const ch = rest[i];
        if (ch === '"' || ch === "'" || ch === "`") {
          const close = rest.indexOf(ch, i + 1);
          i = close === -1 ? rest.length : close;
        } else if (ch === "(" || ch === "{" || ch === "[") depth++;
        else if (ch === ")" || ch === "}" || ch === "]") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
    }
    decorators.push(head[1] + rest.slice(head[0].length, end));
    rest = rest.slice(end).trim();
  }
  return { decorators, rest };
}

/**
 * Property declarations of the model class (`name!: string;`), with the
 * decorators above each one. Initialised properties (relations such as
 * `posts = hasMany(...)`), statics and methods are skipped.
 */
export function declaredProperties(source: string): Declared[] {
  const out: Declared[] = [];
  let decorators: string[] = [];
  let startLine = -1;
  // Bracket depth at the start of each line: properties sit directly in the
  // class body (depth 1), not inside object literals or decorator arguments.
  let depth = 0;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = withoutLineComment(lines[index]).trim();
    const atDepth = depth;
    depth += bracketDelta(line);
    if (atDepth !== 1) {
      // The rest of a multi-line decorator, e.g. `@Column({ nullable: true })`.
      if (decorators.length > 0) decorators[decorators.length - 1] += " " + line;
      continue;
    }
    const split = leadingDecorators(line);
    if (split.decorators.length > 0 && decorators.length === 0) startLine = index;
    decorators.push(...split.decorators);
    // A decorator on its own line, possibly continued on the next lines.
    if (split.decorators.length > 0 && !split.rest) continue;
    const prop = split.rest.match(/^(?:(?:public|declare|readonly)\s+)*(\w+|"[^"]+"|'[^']+')\s*([!?])?\s*:\s*([^=;]+?)\s*;?$/);
    if (prop && !/^(static|private|protected|get|set|async)\b/.test(split.rest)) {
      const name = prop[1].replace(/^["']|["']$/g, "");
      const parts = prop[3].split("|").map((p) => p.trim());
      const nullInType = parts.includes("null") || parts.includes("undefined");
      const optional = prop[2] === "?";
      const ts = parts.filter((p) => p !== "null" && p !== "undefined").join(" | ") || "unknown";
      out.push({
        name,
        ts,
        nullable: optional || nullInType,
        optional,
        nullInType,
        decorators,
        startLine: decorators.length > 0 ? startLine : index,
        endLine: index,
      });
    }
    if (line && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*")) decorators = [];
  }
  return out;
}

/** A line without its trailing `//` comment (a `//` inside a string is kept). */
function withoutLineComment(line: string): string {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = line.indexOf(ch, i + 1);
      if (end === -1) return line;
      i = end;
    } else if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

/** Opening minus closing brackets on a line (already without its comment), ignoring strings. */
function bracketDelta(line: string): number {
  let delta = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = line.indexOf(ch, i + 1);
      if (end === -1) break;
      i = end;
    } else if (ch === "{" || ch === "(" || ch === "[") delta++;
    else if (ch === "}" || ch === ")" || ch === "]") delta--;
  }
  return delta;
}

/** Read a model (Megh ORM or TypeORM) for resource generation. */
export function readModelSchema(source: string, table?: MigrationTable): ResourceSchema {
  const byName = new Map<string, MigrationColumn>((table?.columns ?? []).map((c) => [c.name, c]));
  const withSql = (f: ResourceField): ResourceField => {
    const column = byName.get(f.name);
    return column?.type ? { ...f, sqlType: column.type } : f;
  };

  if (/@Entity\s*\(/.test(source)) {
    const props = declaredProperties(source);
    const skip = /^(PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn|DeleteDateColumn|VersionColumn|OneToMany|ManyToOne|OneToOne|ManyToMany|JoinColumn|JoinTable|RelationId)\b/;
    const pk = props.find((p) => p.decorators.some((d) => /^Primary(Generated)?Column\b/.test(d)));
    const columns = props.filter((p) => p.decorators.some((d) => /^(Primary)?Column\b/.test(d)));
    return {
      kind: "typeorm",
      table: source.match(/@Entity\s*\(\s*(?:\{[^}]*name\s*:\s*)?["'`]([^"'`]+)/)?.[1],
      primaryKey: pk?.name ?? "id",
      primaryKeyType: pk?.ts ?? "number",
      inputFields: columns
        .filter((p) => !p.decorators.some((d) => skip.test(d)))
        .map((p) =>
          withSql({
            name: p.name,
            ts: p.ts,
            nullable: p.nullable || p.decorators.some((d) => /nullable\s*:\s*true/.test(d)),
            generated: p.decorators.some((d) => /default\s*:/.test(d)),
          }),
        ),
    };
  }

  if (/@Table\s*\(/.test(source)) return readDecoratedModel(source, withSql);

  const primaryKey = staticString(source, "primaryKey") ?? "id";
  const generated = new Set(staticList(source, "generated") ?? ["id"]);
  const implicit = new Set<string>();
  if (staticTrue(source, "timestamps")) {
    implicit.add(staticString(source, "createdAt") ?? "created_at");
    implicit.add(staticString(source, "updatedAt") ?? "updated_at");
  }
  if (staticTrue(source, "softDeletes")) implicit.add(staticString(source, "deletedAt") ?? "deleted_at");

  const props = declaredProperties(source);
  const pk = props.find((p) => p.name === primaryKey);
  return {
    kind: "megh",
    table: staticString(source, "table"),
    primaryKey,
    primaryKeyType: pk?.ts ?? "number",
    inputFields: props
      // An auto-generated key and the timestamps are never sent by clients.
      .filter((p) => !implicit.has(p.name) && !(p.name === primaryKey && generated.has(p.name)))
      .map((p) => withSql({ name: p.name, ts: p.ts, nullable: p.nullable, generated: generated.has(p.name) })),
  };
}

/**
 * A model described with decorators. Only decorated columns count; fields
 * declared with `?` (auto-increment, defaults) are filled in by the database.
 */
function readDecoratedModel(source: string, withSql: (f: ResourceField) => ResourceField): ResourceSchema {
  const has = (p: Declared, name: RegExp) => p.decorators.some((d) => name.test(d));
  const columns = declaredProperties(source).filter((p) =>
    has(p, /^(Column|PrimaryKey|AutoIncrement|Identity|CreatedAt|UpdatedAt|DeletedAt)\b/),
  );
  const pk = columns.find((p) => has(p, /^PrimaryKey\b/));
  const primaryKey = pk?.name ?? "id";
  const generated = (p: Declared) => p.optional || has(p, /^(AutoIncrement|Identity)\b/);
  return {
    kind: "megh",
    table: source.match(/@Table\s*\(\s*["'`]([^"'`]+)["'`]/)?.[1],
    primaryKey,
    primaryKeyType: pk?.ts ?? "number",
    inputFields: columns
      // The timestamps and an auto-generated key are never sent by clients.
      .filter((p) => !has(p, /^(CreatedAt|UpdatedAt|DeletedAt)\b/))
      .filter((p) => !(p.name === primaryKey && generated(p)))
      .map((p) => withSql({ name: p.name, ts: p.ts, nullable: p.nullInType, generated: generated(p) })),
  };
}

const INTEGER = /^(int\d?|integer|smallint|mediumint|tinyint|bigint|serial\d?|smallserial|bigserial)$/;

/** class-validator decorators (and the type to declare) for one DTO field. */
function validators(field: ResourceField): { decorators: string[]; ts: string } {
  const sql = field.sqlType ?? "";
  const base = sql.replace(/\(.*$/, "").trim();
  const ts = field.sqlType && field.ts === "unknown" ? fieldType(sql).ts : field.ts;
  const d: string[] = [];
  switch (ts) {
    case "string": {
      if (/(^|_)email$/i.test(field.name)) d.push("IsEmail()");
      else if (base === "uuid") d.push("IsUUID()");
      else d.push("IsString()");
      const length = sql.match(/^(?:n?varchar|n?char|character varying|character)\s*\((\d+)\)/)?.[1];
      if (length) d.push(`MaxLength(${length})`);
      break;
    }
    case "number":
      d.push(INTEGER.test(base) ? "IsInt()" : "IsNumber()");
      break;
    case "boolean":
      d.push("IsBoolean()");
      break;
    case "Date":
      d.push("Type(() => Date)", "IsDate()");
      break;
    default:
      if (/^Record<|^\{/.test(ts)) d.push("IsObject()");
      // Anything else (Buffer, unknown, unions) is accepted as sent.
      else d.push("Allow()");
  }
  return { decorators: d, ts };
}

const key = (name: string) => (IDENTIFIER.test(name) ? name : JSON.stringify(name));

function renderFields(fields: ResourceField[], allOptional: boolean): string {
  return fields
    .map((f) => {
      const { decorators, ts } = validators(f);
      const optional = allOptional || f.nullable || f.generated;
      const lines = [...(optional ? ["@IsOptional()"] : []), ...decorators.map((x) => `@${x}`)];
      const type = f.nullable ? `${ts} | null` : ts;
      lines.push(`${key(f.name)}${optional ? "?" : "!"}: ${type};`);
      return lines.map((l) => `  ${l}`).join("\n");
    })
    .join("\n\n");
}

/** `src/dtos/<model>.dto.ts`: create, update and list-query DTOs. */
export function renderResourceDto(model: string, plural: string, route: string, schema: ResourceSchema): string {
  const create = renderFields(schema.inputFields, false);
  const update = renderFields(schema.inputFields, true);
  // The list query always uses these.
  const used = new Set<string>(["IsInt", "IsOptional", "Max", "Min"]);
  for (const f of schema.inputFields) {
    for (const d of validators(f).decorators) {
      const name = d.match(/^\w+/)![0];
      if (name !== "Type") used.add(name);
    }
  }
  const empty = "  // No writable columns were found on the model.";
  return renderStub("dtos/resource-dto.stub", {
    validators: [...used].sort().join(", "),
    Model: model,
    Plural: plural,
    route,
    createFields: create || empty,
    updateFields: update || empty,
  });
}
