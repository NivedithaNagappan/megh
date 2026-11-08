/**
 * OpenAPI schemas for models: `@ApiResponse(200, User)` documents a model
 * from its column decorators. Registered with core's OpenAPI module, so core
 * doesn't depend on the ORM.
 */
import {
  registerSchemaProvider,
  type SchemaClass,
  type SchemaObject,
} from "./core";
import { getModelMetadata } from "./decorators";

/** JSON schema for a model's columns, from its decorators and TypeScript types. */
export function modelSchema(cls: SchemaClass): SchemaObject | undefined {
  const columns = getModelMetadata(cls)?.columns;
  // Only models described with decorators; others go to the DTO reader.
  if (!columns || columns.size === 0) return undefined;
  const properties: Record<string, SchemaObject> = {};
  const required: string[] = [];
  for (const column of columns.values()) {
    const design = (Reflect as any).getMetadata?.(
      "design:type",
      cls.prototype,
      column.property,
    );
    // `string | null` fields emit `Object` as their type: a length or
    // precision still tells what the column holds.
    const type =
      column.type ??
      (column.length ? "string" : column.precision ? "decimal" : undefined);
    const schema: SchemaObject = columnSchema(
      type,
      design,
      column.primary || !!column.generated,
    );
    if (column.length && schema.type === "string")
      schema.maxLength = column.length;
    if (column.nullable) schema.nullable = true;
    properties[column.property] = schema;
    // Rows read from the database have every column, NULL or not.
    required.push(column.property);
  }
  return { type: "object", properties, required };
}

function columnSchema(
  type: string | undefined,
  design: unknown,
  key: boolean,
): SchemaObject {
  switch (type) {
    case "integer":
    case "bigint":
      return { type: "integer" };
    case "float":
    case "double":
    case "decimal":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "date":
      return { type: "string", format: "date" };
    case "datetime":
    case "timestamp":
      return { type: "string", format: "date-time" };
    case "time":
      return { type: "string", format: "time" };
    case "uuid":
      return { type: "string", format: "uuid" };
    case "json":
      return {};
    case "binary":
      return { type: "string", format: "binary" };
    case "string":
    case "text":
      return { type: "string" };
  }
  if (design === Number) return { type: key ? "integer" : "number" };
  if (design === String) return { type: "string" };
  if (design === Boolean) return { type: "boolean" };
  if (design === Date) return { type: "string", format: "date-time" };
  return {};
}

registerSchemaProvider(modelSchema);
