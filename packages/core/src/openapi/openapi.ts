/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import { registerSchemaProperty } from "./schema-properties";
import type { PaginatedType } from "./responses";

export interface InfoObject {
  title: string;
  description?: string;
  termsOfService?: string;
  contact?: ContactObject;
  license?: LicenseObject;
  version: string;
}
export interface ContactObject {
  name?: string;
  url?: string;
  email?: string;
}
export interface LicenseObject {
  name: string;
  url?: string;
}
export interface ServerObject {
  url: string;
  description?: string;
  variables?: {
    [variable: string]: ServerVariableObject;
  };
}
export interface ServerVariableObject {
  enum?: string[];
  default: string;
  description?: string;
}

/** Swagger UI's top-bar logo. */
export interface SwaggerUiLogo {
  /** Media type, e.g. `"image/svg+xml"` or `"image/png"`. */
  type: string;
  content: string | Buffer;
  /** Link the logo opens. */
  href?: string;
  target?: "_blank" | "_parent" | "_self" | "_top";
}

/** A file Swagger UI's page loads: a stylesheet, script or favicon. */
export interface SwaggerUiThemeFile {
  filename: string;
  content: string | Buffer;
}

export interface SwaggerUiFavicon extends SwaggerUiThemeFile {
  /** e.g. `"icon"`. */
  rel: string;
  /** e.g. `"32x32"`. */
  sizes: string;
  /** e.g. `"image/png"`. */
  type: string;
}

/** Swagger UI's page: its title, extra stylesheets and scripts, and favicons. */
export interface SwaggerUiTheme {
  /** The browser tab's title. */
  title?: string;
  css?: SwaggerUiThemeFile[];
  js?: SwaggerUiThemeFile[];
  favicon?: SwaggerUiFavicon[];
}

/** Swagger UI settings (https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/). */
export interface SwaggerUiConfig {
  /** Which operations start expanded. Megh defaults to `"full"`. */
  docExpansion?: "list" | "full" | "none";
  /** Link to each operation from the URL. Megh defaults to `false`. */
  deepLinking?: boolean;
  /** Keep the "Authorize" credentials across page reloads. */
  persistAuthorization?: boolean;
  /** Show how long each "Try it out" request took. */
  displayRequestDuration?: boolean;
  /** Show a box that filters operations by tag. */
  filter?: boolean | string;
  /** Open every operation in "Try it out" mode. */
  tryItOutEnabled?: boolean;
  /** How deep schemas start expanded in the models list; `-1` hides it. */
  defaultModelsExpandDepth?: number;
  defaultModelExpandDepth?: number;
  /** Order of operations within a tag. */
  operationsSorter?: "alpha" | "method";
  tagsSorter?: "alpha";
  /** Any other Swagger UI setting. */
  [setting: string]: unknown;
}

/** Scalar settings (https://github.com/scalar/scalar/blob/main/documentation/configuration.md). */
export interface ScalarConfig {
  /** Color theme, e.g. `"default"`, `"purple"`, `"moon"`, `"kepler"`. */
  theme?: string;
  layout?: "modern" | "classic";
  darkMode?: boolean;
  hideModels?: boolean;
  /** Hide the "Download OpenAPI document" button. */
  hideDownloadButton?: boolean;
  /** Extra CSS for the page. */
  customCss?: string;
  /** Any other Scalar setting. */
  [setting: string]: unknown;
}

/**
 * How `@Authorized` routes are secured, for the "Authorize" button:
 * `"bearer"` (a JWT in `Authorization: Bearer …`), `"apiKey"` (an
 * `X-API-Key` header), or any OpenAPI security scheme. Each `@Authorized`
 * route is marked with it.
 */
export type OpenApiAuth = "bearer" | "apiKey" | SecuritySchemeObject;

/**
 * Options for `app.useOpenApi()`: the document's details and the docs page.
 *
 * ```ts
 * app.useOpenApi({
 *   info: { title: 'Shop API', version: '1.0.0' },
 *   routePrefix: '/docs',
 *   auth: 'bearer',
 * });
 * ```
 */
export type OpenApiUiOptions = {
  /** The API's title, version and description. Defaults to `{ title: "API", version: "1.0.0" }`. */
  info?: InfoObject;
  /** Where the docs page is served. Defaults to `/swagger`; the document is at `<routePrefix>/json`. */
  routePrefix?: string;
  /** The docs page: Swagger UI (`"default"`) or Scalar (`"scalar"`, needs `@scalar/fastify-api-reference`). */
  provider?: "default" | "scalar";
  /** Marks every `@Authorized` route with this security scheme. See {@link OpenApiAuth}. */
  auth?: OpenApiAuth;
  /** Base URLs the API is served from, e.g. `[{ url: "https://api.example.com" }]`. */
  servers?: ServerObject[];
  /** Descriptions of the tags (one per controller, named after it without `Controller`). */
  tags?: TagObject[];
  /** Security requirement for every operation. Prefer `auth`, which applies to `@Authorized` routes only. */
  security?: SecurityRequirementObject[];
  /** Extra component schemas, responses, security schemes, … merged into the generated ones. */
  components?: ComponentsObject;
  externalDocs?: ExternalDocumentationObject;
  /** Swagger UI settings. With `provider: "scalar"`, Scalar settings (or use `scalar`). */
  uiConfig?: SwaggerUiConfig;
  /** Scalar settings, with `provider: "scalar"`. */
  scalar?: ScalarConfig;
  /** Swagger UI's top-bar logo. Defaults to the Megh logo; `null` shows Swagger UI's own. */
  logo?: SwaggerUiLogo | null;
  /** Swagger UI's page title, CSS, scripts and favicon. Defaults to the Megh favicon. */
  theme?: SwaggerUiTheme;
  /** OpenAPI version of the document. Defaults to `"3.0.3"`. */
  openapi?: string;
  /** Extra paths documented as given, e.g. for routes outside Megh. */
  paths?: PathsObject<any>;
  /** @deprecated Use `provider`. */
  ui?: "default" | "scalar";
  /** @deprecated Use `scalar`. */
  configuration?: ScalarConfig;
};
export interface PathsObject<T extends {} = {}, P extends {} = {}> {
  [pattern: string]: (PathItemObject<T> & P) | undefined;
}
enum HttpMethods {
  GET = "get",
  PUT = "put",
  POST = "post",
  DELETE = "delete",
  OPTIONS = "options",
  HEAD = "head",
  PATCH = "patch",
  TRACE = "trace",
}
export type PathItemObject<T extends {} = {}> = {
  $ref?: string;
  summary?: string;
  description?: string;
  servers?: ServerObject[];
  parameters?: (ReferenceObject | ParameterObject)[];
} & {
  [method in HttpMethods]?: OperationObject<T>;
};
export type OperationObject<T extends {} = {}> = {
  tags?: string[];
  summary?: string;
  description?: string;
  externalDocs?: ExternalDocumentationObject;
  operationId?: string;
  parameters?: (ReferenceObject | ParameterObject)[];
  requestBody?: ReferenceObject | RequestBodyObject;
  responses: ResponsesObject;
  callbacks?: {
    [callback: string]: ReferenceObject | CallbackObject;
  };
  deprecated?: boolean;
  security?: SecurityRequirementObject[];
  servers?: ServerObject[];
} & T;
export interface ExternalDocumentationObject {
  description?: string;
  url: string;
}
export interface ParameterObject extends ParameterBaseObject {
  name: string;
  in: string;
}
export interface HeaderObject extends ParameterBaseObject {}
export interface ParameterBaseObject {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema?: ReferenceObject | SchemaObject;
  example?: any;
  examples?: {
    [media: string]: ReferenceObject | ExampleObject;
  };
  content?: {
    [media: string]: MediaTypeObject;
  };
}
export type NonArraySchemaObjectType =
  "boolean" | "object" | "number" | "string" | "integer";
export type ArraySchemaObjectType = "array";
export type SchemaObject = ArraySchemaObject | NonArraySchemaObject;
export interface ArraySchemaObject extends BaseSchemaObject {
  type: ArraySchemaObjectType;
  items: ReferenceObject | SchemaObject;
}
export interface NonArraySchemaObject extends BaseSchemaObject {
  type?: NonArraySchemaObjectType;
}
export interface BaseSchemaObject {
  title?: string;
  description?: string;
  format?: string;
  default?: any;
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: boolean;
  minimum?: number;
  exclusiveMinimum?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  additionalProperties?: boolean | ReferenceObject | SchemaObject;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  enum?: any[];
  properties?: {
    [name: string]: ReferenceObject | SchemaObject;
  };
  allOf?: (ReferenceObject | SchemaObject)[];
  oneOf?: (ReferenceObject | SchemaObject)[];
  anyOf?: (ReferenceObject | SchemaObject)[];
  not?: ReferenceObject | SchemaObject;
  nullable?: boolean;
  discriminator?: DiscriminatorObject;
  readOnly?: boolean;
  writeOnly?: boolean;
  xml?: XMLObject;
  externalDocs?: ExternalDocumentationObject;
  example?: any;
  deprecated?: boolean;
}
export interface DiscriminatorObject {
  propertyName: string;
  mapping?: {
    [value: string]: string;
  };
}
export interface XMLObject {
  name?: string;
  namespace?: string;
  prefix?: string;
  attribute?: boolean;
  wrapped?: boolean;
}
export interface ReferenceObject {
  $ref: string;
}
export interface ExampleObject {
  summary?: string;
  description?: string;
  value?: any;
  externalValue?: string;
}
export interface MediaTypeObject {
  schema?: ReferenceObject | SchemaObject;
  example?: any;
  examples?: {
    [media: string]: ReferenceObject | ExampleObject;
  };
  encoding?: {
    [media: string]: EncodingObject;
  };
}
export interface EncodingObject {
  contentType?: string;
  headers?: {
    [header: string]: ReferenceObject | HeaderObject;
  };
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
}
export interface RequestBodyObject {
  description?: string;
  content: {
    [media: string]: MediaTypeObject;
  };
  required?: boolean;
}
export interface ResponsesObject {
  [code: string]: ReferenceObject | ResponseObject;
}
export interface ResponseObject {
  description: string;
  headers?: {
    [header: string]: ReferenceObject | HeaderObject;
  };
  content?: {
    [media: string]: MediaTypeObject;
  };
  links?: {
    [link: string]: ReferenceObject | LinkObject;
  };
}
export interface LinkObject {
  operationRef?: string;
  operationId?: string;
  parameters?: {
    [parameter: string]: any;
  };
  requestBody?: any;
  description?: string;
  server?: ServerObject;
}
export interface CallbackObject {
  [url: string]: PathItemObject;
}
export interface SecurityRequirementObject {
  [name: string]: string[];
}
export interface ComponentsObject {
  schemas?: {
    [key: string]: ReferenceObject | SchemaObject;
  };
  responses?: {
    [key: string]: ReferenceObject | ResponseObject;
  };
  parameters?: {
    [key: string]: ReferenceObject | ParameterObject;
  };
  examples?: {
    [key: string]: ReferenceObject | ExampleObject;
  };
  requestBodies?: {
    [key: string]: ReferenceObject | RequestBodyObject;
  };
  headers?: {
    [key: string]: ReferenceObject | HeaderObject;
  };
  securitySchemes?: {
    [key: string]: ReferenceObject | SecuritySchemeObject;
  };
  links?: {
    [key: string]: ReferenceObject | LinkObject;
  };
  callbacks?: {
    [key: string]: ReferenceObject | CallbackObject;
  };
}
export type SecuritySchemeObject =
  | HttpSecurityScheme
  | ApiKeySecurityScheme
  | OAuth2SecurityScheme
  | OpenIdSecurityScheme;
export interface HttpSecurityScheme {
  type: "http";
  description?: string;
  scheme: string;
  bearerFormat?: string;
}
export interface ApiKeySecurityScheme {
  type: "apiKey";
  description?: string;
  name: string;
  in: string;
}
export interface OAuth2SecurityScheme {
  type: "oauth2";
  description?: string;
  flows: {
    implicit?: {
      authorizationUrl: string;
      refreshUrl?: string;
      scopes: {
        [scope: string]: string;
      };
    };
    password?: {
      tokenUrl: string;
      refreshUrl?: string;
      scopes: {
        [scope: string]: string;
      };
    };
    clientCredentials?: {
      tokenUrl: string;
      refreshUrl?: string;
      scopes: {
        [scope: string]: string;
      };
    };
    authorizationCode?: {
      authorizationUrl: string;
      tokenUrl: string;
      refreshUrl?: string;
      scopes: {
        [scope: string]: string;
      };
    };
  };
}
export interface OpenIdSecurityScheme {
  type: "openIdConnect";
  description?: string;
  openIdConnectUrl: string;
}
export interface TagObject {
  name: string;
  description?: string;
  externalDocs?: ExternalDocumentationObject;
}

export type ParamSchema = {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  example?: any;
  required?: boolean;
  deprecated?: boolean;
  enum?: any[];
  format?: string;
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  properties?: Record<string, ParamSchema>; // for nested object properties
  additionalProperties?: boolean | ParamSchema;
};

export type ParamsSchemaMap = Record<string, ParamSchema>;

/** A DTO class; documented through its `#/components/schemas/<Name>` schema. */
export type SchemaClass = abstract new (...args: any[]) => any;

/** A Media Type Object whose `schema` may also be a DTO class. */
export type RequestBodyMediaTypeOptions = Omit<MediaTypeObject, "schema"> & {
  schema?: SchemaObject | ReferenceObject | SchemaClass;
};

export type RequestBodyOptions = {
  description?: string;
  /** Defaults to `true`. */
  required?: boolean;
  /**
   * Full control over each media type. When given, `schema`, `contentType`,
   * `example`, `examples` and `encoding` are ignored.
   */
  content?: {
    [media: string]: RequestBodyMediaTypeOptions;
  };
  /**
   * Body schema: a JSON schema, a `$ref`, or a DTO class. Defaults to the
   * route's `@Body()` DTO.
   */
  schema?: SchemaObject | ReferenceObject | SchemaClass;
  /**
   * Media type(s) `schema` is documented under. Defaults to
   * `multipart/form-data` when the schema has a binary field, otherwise
   * `application/json`.
   */
  contentType?: string | string[];
  example?: any;
  examples?: Record<string, ExampleObject | ReferenceObject>;
  encoding?: Record<string, EncodingObject>;
};

export type ResponseBodyOptions = {
  description?: string;
  type?: NonArraySchemaObjectType | ArraySchemaObjectType;
  properties?: {
    [name: string]: ReferenceObject | SchemaObject;
  };
  items?: ReferenceObject | SchemaObject;
  required?: string[];
  schema?: SchemaObject | ReferenceObject;
  example?: any;
  examples?: Record<string, ExampleObject>;
  content?: {
    [media: string]: MediaTypeObject;
  };
} & Partial<BaseSchemaObject>; // ✅ inherits all schema fields (format, enum, minimum, etc.)

/**
 * Responses keyed by status code. A DTO or model class, `[Class]` or
 * `Paginated(Class)` is documented only; a JSON schema (`ResponseBodyOptions`)
 * also becomes Fastify's response schema, which serializes the reply.
 */
export type ResponsesOptions = {
  [statusCode: number]:
    | ResponseBodyOptions
    | ResponseObject
    | SchemaClass
    | readonly [SchemaClass]
    | PaginatedType;
};

export type OpenApiOptions = {
  exclude?: boolean;
  deprecated?: boolean;
  tags?: readonly string[];
  description?: string;
  summary?: string;
  operationId?: string;
  security?: SecurityRequirementObject[];
  externalDocs?: ExternalDocumentationObject;
  components?: ComponentsObject;

  /** Path parameters e.g. /:id → { id: { type: "string", example: "abc-123" } } */
  params?: ParamsSchemaMap;

  /** Query string parameters e.g. ?page=1 → { page: { type: "integer", example: 1 } } */
  query?: ParamsSchemaMap;

  /** Request headers */
  headers?: ParamsSchemaMap;

  /**
   * Request body: options, a DTO class, or a `$ref` to
   * `#/components/requestBodies/*`. Documentation only; validation still
   * comes from the `@Body()` DTO.
   */
  requestBody?: RequestBodyOptions | ReferenceObject | SchemaClass;

  /** Responses keyed by HTTP status code */
  response?: ResponsesOptions;

  /** @deprecated Misnamed alias of `requestBody`; use `requestBody`. */
  responseBody?: RequestBodyOptions | ReferenceObject | SchemaClass;
};

/**
 * Normalize a flat ParamsSchemaMap into a valid JSON Schema object
 * that Fastify/AJV can validate against.
 *
 * Input:  { id: { type: "string", example: "abc-123" } }
 * Output: { type: "object", properties: { id: { type: "string", example: "abc-123" } } }
 */
export function normalizeParamsToJsonSchema(
  params: ParamsSchemaMap,
  requiredKeys: string[] = [],
): SchemaObject {
  const properties: Record<string, any> = {};

  for (const [key, val] of Object.entries(params)) {
    properties[key] = {
      type: "string", // sensible default
      ...val,
    };
  }

  const schema: any = {
    type: "object",
    properties,
  };

  if (requiredKeys.length > 0) {
    schema.required = requiredKeys;
  }

  return schema;
}
export function OpenApiSchema(): ClassDecorator {
  return function (target) {
    Reflect.defineMetadata("openapi:schema", true, target);
  };
}
export function OpenApi(
  options: OpenApiOptions,
): MethodDecorator & ClassDecorator & PropertyDecorator {
  return function (
    target: Object | Function,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) {
    if (typeof target === "function" && !propertyKey) {
      Reflect.defineMetadata("controller:openapi", options, target);
    } else if (descriptor) {
      // ✅ Store options as-is — router's buildRouteSchema handles normalization
      Reflect.defineMetadata("route:openapi", options, target, propertyKey!);
    } else if (propertyKey) {
      Reflect.defineMetadata("property:openapi", options, target, propertyKey);
      if (typeof propertyKey === "string")
        registerSchemaProperty(target, propertyKey);
    }
  };
}
