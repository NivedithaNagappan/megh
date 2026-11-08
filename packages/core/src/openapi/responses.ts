/**
 * Documented responses: what each route returns, from `@ApiResponse()` and
 * what the controller tells us (a validated DTO can fail with 400, an
 * `@Authorized` route with 401 and 403).
 *
 * Like request bodies (see request-body.ts), these are documentation only.
 * A Fastify `response` schema would also serialize the reply, dropping every
 * field it doesn't list (loaded relations, `withCount` counts, …), so the
 * Responses Object rides on the route schema under {@link RESPONSES_EXTENSION}
 * and {@link applyResponseExtensions} moves it into the document.
 */
import { PAGINATED_ITEM as PAGINATED } from "../collection/pagination";
import type {
  ReferenceObject,
  ResponseObject,
  SchemaClass,
  SchemaObject,
} from "./openapi";
import { generateClassSchema } from "./swagger-schema";

export const RESPONSES_EXTENSION = "x-megh-responses";
/** Marks an operation that needs authorization, for the `auth` option. */
export const AUTHORIZED_EXTENSION = "x-megh-authorized";

const RESPONSES_META = "openapi:responses";
const SCHEMAS = "#/components/schemas/";

/** `{ data: T[], meta }`, as `paginate()` returns. Build it with {@link Paginated}. */
export interface PaginatedType {
  readonly [PAGINATED]: SchemaClass;
}

/**
 * What a response body is: a DTO or model class, `[Class]` for an array,
 * `Paginated(Class)` for a page, or a JSON schema.
 */
export type ResponseType =
  | SchemaClass
  | readonly [SchemaClass]
  | PaginatedType
  | SchemaObject
  | ReferenceObject;

export interface ApiResponseOptions {
  /** The body. Leave it out for an empty body; errors default to the error shape. */
  type?: ResponseType;
  /** Defaults to a description of the status code. */
  description?: string;
  /** Defaults to `application/json`. */
  contentType?: string;
  example?: unknown;
}

interface DeclaredResponse extends ApiResponseOptions {
  status: number;
}

/**
 * Document a response of a route (on a method) or of every route in a
 * controller (on the class). Stack it for several status codes:
 *
 * ```ts
 * @Get('/:id')
 * @ApiResponse(200, User)
 * @ApiResponse(404)
 * show(@Param('id') id: number) { … }
 * ```
 *
 * The type may be a DTO or MeghORM model class, `[User]` for an array,
 * `Paginated(User)` for a page, or a JSON schema. It's documentation only:
 * what the handler returns is sent unchanged.
 */
export function ApiResponse(
  status: number,
  type?: ResponseType | ApiResponseOptions,
  description?: string,
): MethodDecorator & ClassDecorator {
  const entry: DeclaredResponse = isOptions(type)
    ? { status, ...type }
    : { status, type, description };
  return (target: object, propertyKey?: string | symbol) => {
    const args = propertyKey === undefined ? [target] : [target, propertyKey];
    const list: DeclaredResponse[] =
      (Reflect as any).getOwnMetadata(RESPONSES_META, ...args) ?? [];
    (Reflect as any).defineMetadata(RESPONSES_META, [...list, entry], ...args);
  };
}

/** `@ApiResponse()`s on a controller class and one of its methods. */
export function declaredResponses(
  controller: Function,
  method: string,
): DeclaredResponse[] {
  const get = (...args: any[]): DeclaredResponse[] =>
    (Reflect as any).getMetadata(RESPONSES_META, ...args) ?? [];
  return [...get(controller), ...get(controller.prototype, method)];
}

function isOptions(value: unknown): value is ApiResponseOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (PAGINATED in (value as object) || "$ref" in (value as object))
    return false;
  // A JSON schema has schema keywords; options have only these keys.
  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    keys.every((k) =>
      ["type", "description", "contentType", "example"].includes(k),
    ) &&
    typeof (value as any).type !== "string"
  );
}

const isClass = (value: unknown): value is SchemaClass =>
  typeof value === "function" && !!(value as Function).prototype;

/** Whether `value` is something a response can be documented with (a class, `[Class]` or `Paginated()`). */
export function isResponseType(value: unknown): boolean {
  return (
    isClass(value) ||
    (Array.isArray(value) && value.length === 1 && isClass(value[0])) ||
    (!!value && typeof value === "object" && PAGINATED in value)
  );
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

const ERROR_SCHEMA = {
  type: "object",
  description: "Megh's error response.",
  properties: {
    code: { type: "integer", example: 404 },
    status: { type: "string", example: "Error" },
    message: { type: "string", example: "Not Found" },
    data: { description: "Details, when the error carries any." },
  },
  required: ["code", "status", "message"],
};

const VALIDATION_ERROR_SCHEMA = {
  type: "object",
  description: "A request that failed DTO validation.",
  properties: {
    code: { type: "integer", example: 400 },
    status: { type: "string", example: "Error" },
    message: { type: "string", example: "email must be an email" },
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string", example: "email" },
          constraints: {
            type: "object",
            additionalProperties: { type: "string" },
            example: { isEmail: "email must be an email" },
          },
        },
      },
    },
  },
  required: ["code", "status", "message"],
};

const PAGINATION_META_SCHEMA = {
  type: "object",
  properties: {
    total: { type: "integer", description: "Items across all pages." },
    page: { type: "integer", description: "Current 1-based page." },
    perPage: { type: "integer", description: "Items per page." },
    lastPage: {
      type: "integer",
      description: "Last page number (at least 1).",
    },
    next: {
      type: "integer",
      nullable: true,
      description: "Next page, or null on the last page.",
    },
    prev: {
      type: "integer",
      nullable: true,
      description: "Previous page, or null on the first page.",
    },
  },
  required: ["total", "page", "perPage", "lastPage", "next", "prev"],
};

/**
 * Something that can describe a class as a JSON schema, e.g. the ORM for its
 * models. Returns `undefined` for classes it doesn't know.
 */
export type SchemaProvider = (cls: SchemaClass) => SchemaObject | undefined;

const schemaProviders: SchemaProvider[] = [];

/** Describe classes the DTO reader doesn't (MeghORM registers its models). */
export function registerSchemaProvider(provider: SchemaProvider): void {
  if (!schemaProviders.includes(provider)) schemaProviders.push(provider);
}

function providedSchema(cls: SchemaClass): SchemaObject | undefined {
  for (const provider of schemaProviders) {
    const schema = provider(cls);
    if (schema) return schema;
  }
  return undefined;
}

/** A `$ref` to `cls`'s schema, collecting it (and what it references) into `schemas`. */
function schemaRef(
  cls: SchemaClass,
  schemas: Record<string, any>,
): ReferenceObject {
  const name = cls.name;
  if (!(name in schemas)) {
    schemas[name] = { type: "object" }; // placeholder for cycles
    schemas[name] =
      providedSchema(cls) ?? generateClassSchema(cls, { components: schemas });
  }
  return { $ref: `${SCHEMAS}${name}` };
}

function bodySchema(
  type: ResponseType,
  schemas: Record<string, any>,
): SchemaObject | ReferenceObject {
  if (isClass(type)) return schemaRef(type, schemas);
  if (Array.isArray(type))
    return { type: "array", items: schemaRef(type[0], schemas) };
  if (type && typeof type === "object" && PAGINATED in type) {
    const item = (type as PaginatedType)[PAGINATED];
    schemas.PaginationMeta ??= PAGINATION_META_SCHEMA;
    return {
      type: "object",
      properties: {
        data: { type: "array", items: schemaRef(item, schemas) },
        meta: { $ref: `${SCHEMAS}PaginationMeta` },
      },
      required: ["data", "meta"],
    };
  }
  return type as SchemaObject | ReferenceObject;
}

function response(
  entry: DeclaredResponse,
  schemas: Record<string, any>,
): ResponseObject {
  const description =
    entry.description ?? STATUS_TEXT[entry.status] ?? `Status ${entry.status}`;
  let type = entry.type;
  if (type === undefined && entry.status >= 400) {
    schemas.ErrorResponse ??= ERROR_SCHEMA;
    type = { $ref: `${SCHEMAS}ErrorResponse` };
  }
  if (type === undefined) return { description };
  const media: any = { schema: bodySchema(type, schemas) };
  if (entry.example !== undefined) media.example = entry.example;
  return {
    description,
    content: { [entry.contentType ?? "application/json"]: media },
  };
}

export interface RouteResponses {
  responses: Record<string, ResponseObject>;
  /** Component schemas the responses refer to, keyed by name. */
  schemas: Record<string, any>;
}

/**
 * The Responses Object for a route: its `@ApiResponse()`s, plus the errors
 * its controller can produce that aren't declared already.
 */
export function buildResponses(route: {
  declared: DeclaredResponse[];
  /** The route validates a `@Body()` or `@Query()` DTO. */
  validates: boolean;
  /** `@Authorized` applies to the route. */
  authorized: boolean;
}): RouteResponses | undefined {
  const schemas: Record<string, any> = {};
  const responses: Record<string, ResponseObject> = {};
  for (const entry of route.declared)
    responses[String(entry.status)] = response(entry, schemas);

  if (route.validates && !responses["400"]) {
    schemas.ValidationErrorResponse ??= VALIDATION_ERROR_SCHEMA;
    responses["400"] = response(
      {
        status: 400,
        description: "Validation failed",
        type: { $ref: `${SCHEMAS}ValidationErrorResponse` },
      },
      schemas,
    );
  }
  if (route.authorized) {
    responses["401"] ??= response(
      { status: 401, description: "Missing or invalid credentials" },
      schemas,
    );
    responses["403"] ??= response(
      { status: 403, description: "Not allowed to do this" },
      schemas,
    );
  }
  return Object.keys(responses).length ? { responses, schemas } : undefined;
}

/**
 * Move each operation's {@link RESPONSES_EXTENSION} into its `responses`,
 * add the schemas they use, and apply `security` to authorized operations.
 */
export function applyResponseExtensions<T = any>(
  document: T,
  security?: { requirement: Record<string, string[]>; scheme: [string, any] },
): T {
  const doc = document as any;
  const schemas: Record<string, any> = {};
  for (const item of Object.values<any>(doc?.paths ?? {})) {
    for (const operation of Object.values<any>(item ?? {})) {
      if (!operation || typeof operation !== "object") continue;
      const extension: RouteResponses | undefined =
        operation[RESPONSES_EXTENSION];
      delete operation[RESPONSES_EXTENSION];
      const authorized = operation[AUTHORIZED_EXTENSION] === true;
      delete operation[AUTHORIZED_EXTENSION];
      if (authorized && security && !operation.security)
        operation.security = [security.requirement];
      if (!extension) continue;

      const existing = operation.responses ?? {};
      const declaresSuccess = Object.keys(extension.responses).some((s) =>
        s.startsWith("2"),
      );
      // @fastify/swagger adds a bare "200: Default Response"; a documented success replaces it.
      if (
        declaresSuccess &&
        existing["200"]?.description === "Default Response" &&
        !existing["200"].content
      ) {
        delete existing["200"];
      }
      operation.responses = { ...existing, ...extension.responses };
      Object.assign(schemas, extension.schemas);
    }
  }
  if (Object.keys(schemas).length || security) {
    doc.components ??= {};
    if (Object.keys(schemas).length)
      doc.components.schemas = { ...schemas, ...doc.components.schemas };
    if (security) {
      doc.components.securitySchemes = {
        [security.scheme[0]]: security.scheme[1],
        ...doc.components.securitySchemes,
      };
    }
  }
  return document;
}
