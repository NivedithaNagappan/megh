import type { FieldDef } from "./fields";
import type { ModelTemplate } from "./template";

/** The schema builder call for one column, e.g. `table.string("name", 100).nullable();`. */
export function renderColumn(field: FieldDef): string {
  const name = JSON.stringify(field.name);
  let call: string;
  switch (field.type) {
    case "string":
      call = field.length && field.length !== 255 ? `string(${name}, ${field.length})` : `string(${name})`;
      break;
    case "decimal":
      call = field.precision ? `decimal(${name}, ${field.precision}, ${field.scale ?? 2})` : `decimal(${name})`;
      break;
    default:
      call = `${field.type}(${name})`;
  }
  let line = `table.${call}`;
  const setNull = field.references?.onDelete === "set null";
  if (field.nullable && !setNull) line += ".nullable()";
  if (field.unique) line += ".unique()";
  if (field.default !== undefined) line += `.default(${JSON.stringify(field.default)})`;
  if (field.references) {
    line += `.constrained(${JSON.stringify(field.references.table)})`;
    if (field.references.onDelete === "cascade") line += ".cascadeOnDelete()";
    else if (setNull) line += ".nullOnDelete()";
    else if (field.references.onDelete === "restrict") line += `.onDelete("restrict")`;
  }
  line += ";";
  if (field.enum) line += ` // ${field.enum.join(" | ")}`;
  return line;
}

/** A `defineMigration` file creating the template's table. */
export function renderCreateMigration(t: ModelTemplate, table = t.table): string {
  const lines: string[] = [];
  if (!t.pivot) lines.push("table.id();");
  for (const field of t.fields) lines.push(renderColumn(field));
  if (t.timestamps) lines.push("table.timestamps();");
  if (t.softDeletes) lines.push("table.softDeletes();");

  const list = (columns: string[]) => `[${columns.map((c) => JSON.stringify(c)).join(", ")}]`;
  if (t.pivot) {
    const keys = t.fields.filter((f) => f.type === "foreignId").map((f) => f.name);
    if (keys.length >= 2) lines.push(`table.primary(${list(keys.slice(0, 2))});`);
  }
  for (const field of t.fields) if (field.index && !field.unique) lines.push(`table.index(${JSON.stringify(field.name)});`);
  for (const columns of t.unique) lines.push(`table.unique(${list(columns)});`);

  return `import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create(${JSON.stringify(table)}, (table) => {
${lines.map((l) => `      ${l}`).join("\n")}
    });
  },

  async down(schema) {
    await schema.drop(${JSON.stringify(table)});
  },
});
`;
}
