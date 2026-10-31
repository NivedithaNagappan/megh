/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Internal: turning `@OpenApi({ requestBody })` and `@Body(Dto)` into an
 * OpenAPI 3 Request Body Object.
 *
 * `@fastify/swagger` only documents a body through the Fastify `body`
 * validation schema, which can't carry a description, `required: false`,
 * several media types with different schemas, examples or encodings. So the
 * finished Request Body Object rides on the route schema under
 * {@link REQUEST_BODY_EXTENSION} (`x-` keys are copied onto the operation
 * as-is) and {@link applyRequestBodyExtensions} moves it into place once the
 * document is generated. Request validation is unaffected.
 */
import type {
  ReferenceObject,
  RequestBodyObject,
  MediaTypeObject,
  RequestBodyOptions,
  RequestBodyMediaTypeOptions,
} from "./openapi";
import { generateClassSchema } from "./swagger-schema";

export const REQUEST_BODY_EXTENSION = "x-avleon-request-body";

const JSON_MEDIA = "application/json";
const MULTIPART_MEDIA = "multipart/form-data";
const SCHEMAS_PATH = "#/components/schemas/";

type RequestBodyExtension = {
  requestBody: RequestBodyObject | ReferenceObject;
  /** Component schemas the request body refers to, keyed by name. */
  schemas: Record<string, any>;
};

function isClass(value: unknown): value is Function {
  return typeof value === "function" && !!(value as Function).prototype;
}

function isReference(value: unknown): value is ReferenceObject {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as any).$ref === "string"
  );
}

/** A DTO class becomes a `$ref` (its schema is collected); anything else passes through. */
function resolveSchema(schema: any, schemas: Record<string, any>): any {
  if (!isClass(schema)) return schema;
  const name = schema.name;
  if (!(name in schemas)) {
    schemas[name] = { type: "object" }; // placeholder for cycles
    schemas[name] = generateClassSchema(schema, { components: schemas });
  }
  return { $ref: `${SCHEMAS_PATH}${name}` };
}

function isBinary(schema: any): boolean {
  if (!schema || typeof schema !== "object") return false;
  if (schema.format === "binary") return true;
  return schema.type === "array" && schema.items?.format === "binary";
}

/** True when the (possibly `$ref`'d) object schema has a file field. */
function hasBinaryField(schema: any, schemas: Record<string, any>): boolean {
  if (isReference(schema) && schema.$ref.startsWith(SCHEMAS_PATH)) {
    schema = schemas[schema.$ref.slice(SCHEMAS_PATH.length)];
  }
  return Object.values(schema?.properties ?? {}).some(isBinary);
}

function resolveMedia(
  media: RequestBodyMediaTypeOptions,
  schemas: Record<string, any>,
): MediaTypeObject {
  const out: MediaTypeObject = { ...(media as any) };
  if (media.schema !== undefined) {
    out.schema = resolveSchema(media.schema, schemas);
  }
  return out;
}

export type BuildRequestBodyInput = {
  /** `requestBody` from `@OpenApi`, if any. */
  requestBody?: RequestBodyOptions | ReferenceObject | Function;
  /** DTO class of the route's `@Body()` parameter, if any. */
  bodyClass?: Function;
  /** Media types the route accepts (`consumes`), used when none is given. */
  consumes?: string[];
};

/**
 * Build the OpenAPI Request Body Object for a route, or `undefined` when the
 * route documents no body. `requestBody` options win over the `@Body()` DTO;
 * a `requestBody` without a schema or content documents the DTO.
 */
export function buildRequestBody(
  input: BuildRequestBodyInput,
): RequestBodyExtension | undefined {
  const { bodyClass, consumes } = input;
  let options = input.requestBody;
  if (!options && !bodyClass) return undefined;

  const schemas: Record<string, any> = {};

  if (isReference(options)) {
    return { requestBody: { $ref: options.$ref }, schemas };
  }
  if (isClass(options)) options = { schema: options as any };
  const opts: RequestBodyOptions = (options as RequestBodyOptions) ?? {};

  const content: Record<string, MediaTypeObject> = {};

  if (opts.content && Object.keys(opts.content).length > 0) {
    for (const [mediaType, media] of Object.entries(opts.content)) {
      content[mediaType] = resolveMedia(media ?? {}, schemas);
    }
  } else {
    const rawSchema = opts.schema ?? bodyClass;
    const schema =
      rawSchema === undefined ? undefined : resolveSchema(rawSchema, schemas);

    let mediaTypes: string[];
    if (opts.contentType) {
      mediaTypes = Array.isArray(opts.contentType)
        ? opts.contentType
        : [opts.contentType];
    } else if (consumes && consumes.length > 0) {
      mediaTypes = consumes;
    } else if (schema && hasBinaryField(schema, schemas)) {
      mediaTypes = [MULTIPART_MEDIA];
    } else {
      mediaTypes = [JSON_MEDIA];
    }

    const media: MediaTypeObject = {};
    if (schema !== undefined) media.schema = schema;
    if (opts.example !== undefined) media.example = opts.example;
    if (opts.examples !== undefined) media.examples = opts.examples;
    if (opts.encoding !== undefined) media.encoding = opts.encoding;

    for (const mediaType of mediaTypes) content[mediaType] = { ...media };
  }

  const requestBody: RequestBodyObject = { content };
  if (opts.description !== undefined)
    requestBody.description = opts.description;
  // OpenAPI defaults `required` to false; a body the route parses is
  // required unless the options say otherwise.
  requestBody.required = opts.required ?? true;

  return { requestBody, schemas };
}

/**
 * `@fastify/swagger` `transformObject` hook: move every route's
 * {@link REQUEST_BODY_EXTENSION} into the operation's `requestBody` and add
 * the schemas it refers to to `components.schemas`.
 */
export function applyRequestBodyExtensions<T = any>(document: T): T {
  const doc: any = document;
  const paths = doc?.paths;
  if (!paths || typeof paths !== "object") return document;

  for (const pathItem of Object.values<any>(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const operation of Object.values<any>(pathItem)) {
      if (!operation || typeof operation !== "object") continue;
      const ext: RequestBodyExtension | undefined =
        operation[REQUEST_BODY_EXTENSION];
      if (!ext) continue;
      delete operation[REQUEST_BODY_EXTENSION];

      operation.requestBody = structuredClone(ext.requestBody);

      const names = Object.keys(ext.schemas);
      if (names.length > 0) {
        doc.components ??= {};
        doc.components.schemas ??= {};
        for (const name of names) {
          if (!(name in doc.components.schemas)) {
            doc.components.schemas[name] = structuredClone(ext.schemas[name]);
          }
        }
      }
    }
  }
  return document;
}
