/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Internal: documenting `@Query()` parameters as OpenAPI query parameters.
 *
 * Megh validates query DTOs itself, so routes get no Fastify `querystring`
 * schema (that would add a second validator with different errors). The
 * parameters ride on the route schema under {@link QUERY_PARAMS_EXTENSION}
 * and {@link applyQueryParamExtensions} moves them into place once the
 * document is generated.
 */
import type { ParameterObject } from "./openapi";
import { generateClassSchema } from "./swagger-schema";

export const QUERY_PARAMS_EXTENSION = "x-megh-query-parameters";

type QueryMeta = {
  index: number;
  key: string;
  required?: boolean;
  dataType?: unknown;
  validatorClass?: boolean;
};

const PRIMITIVES = new Set(["string", "number", "integer", "boolean"]);

function isClass(value: unknown): value is Function {
  return typeof value === "function" && !!(value as Function).prototype;
}

/** A property schema as a Parameter Object; `description`/`example` move up a level. */
function toParameter(
  name: string,
  schema: any,
  required: boolean,
): ParameterObject {
  const { description, example, ...rest } = schema ?? {};
  const param: ParameterObject = { name, in: "query", required, schema: rest };
  if (description !== undefined) param.description = description;
  if (example !== undefined) param.example = example;
  return param;
}

/**
 * Query parameters for a route's `@Query()` metadata: a whole-query DTO
 * (`@Query() q: Dto`) becomes one parameter per property, `@Query('key')`
 * one parameter.
 */
export function buildQueryParameters(query: QueryMeta[]): ParameterObject[] {
  const out: ParameterObject[] = [];
  const seen = new Set<string>();
  const add = (p: ParameterObject) => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    out.push(p);
  };

  // Parameter decorators run last to first; list them in signature order.
  const ordered = [...query].sort((a, b) => a.index - b.index);
  for (const q of ordered) {
    const type = q.dataType;
    if (q.key === "all") {
      if (!q.validatorClass || !isClass(type)) continue;
      const schema = generateClassSchema(type, { inline: true });
      const required: string[] = schema.required ?? [];
      for (const [name, prop] of Object.entries<any>(schema.properties ?? {}))
        add(toParameter(name, prop, required.includes(name)));
      continue;
    }

    let schema: any;
    if (typeof type === "string" && PRIMITIVES.has(type)) schema = { type };
    else if (type === "array")
      schema = { type: "array", items: { type: "string" } };
    else if (q.validatorClass && isClass(type))
      schema = generateClassSchema(type, { inline: true });
    else schema = { type: "string" };

    const param = toParameter(q.key, schema, q.required ?? true);
    if (schema.type === "object") {
      param.style = "deepObject";
      param.explode = true;
    }
    add(param);
  }
  return out;
}

/**
 * `@fastify/swagger` `transformObject` hook: add every route's
 * {@link QUERY_PARAMS_EXTENSION} to the operation's `parameters`. A query
 * parameter already documented (e.g. through `@OpenApi({ query })`) wins.
 */
export function applyQueryParamExtensions<T = any>(document: T): T {
  const paths = (document as any)?.paths;
  if (!paths || typeof paths !== "object") return document;

  for (const pathItem of Object.values<any>(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const operation of Object.values<any>(pathItem)) {
      if (!operation || typeof operation !== "object") continue;
      const ext: ParameterObject[] | undefined =
        operation[QUERY_PARAMS_EXTENSION];
      if (!ext) continue;
      delete operation[QUERY_PARAMS_EXTENSION];

      const params: any[] = (operation.parameters ??= []);
      const documented = new Set(
        params.filter((p) => p?.in === "query").map((p) => p.name),
      );
      for (const p of ext) {
        if (!documented.has(p.name)) params.push(structuredClone(p));
      }
    }
  }
  return document;
}
