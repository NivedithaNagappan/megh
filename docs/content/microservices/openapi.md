---
title: OpenAPI
description: "Generating API documentation from your controllers: typed options, request bodies and responses from DTOs and models, and secured routes."
---

# OpenAPI

Megh generates an OpenAPI document from your controllers and serves a browsable
UI. Request bodies and query strings come from your DTOs, responses from
`@ApiResponse()` with a DTO or MeghORM model, and the errors a route can return
from what its controller declares. The UI packages are optional peer
dependencies. Install the one you use:

::: code-group
```sh [Swagger UI]
npm i @fastify/swagger @fastify/swagger-ui
```
```sh [Scalar]
npm i @fastify/swagger @scalar/fastify-api-reference
```
:::

## Enabling

```sh
npx megh make:config openapi
```

::: code-group
```ts [config/openapi.config.ts]
import { AppConfig, MeghConfig, Environment, OpenApiUiOptions } from '@meghjs/core';

@AppConfig
export class OpenApiConfig extends MeghConfig<OpenApiUiOptions> {
  config(env: Environment): OpenApiUiOptions {
    return {
      info: {
        title: 'My API',
        version: '1.0.0',
        description: 'API documentation',
      },
      routePrefix: '/docs',
    };
  }
}
```

```ts [app.ts]
import { Megh } from '@meghjs/core';
import { OpenApiConfig } from './config/openapi.config';
import { WelcomeController } from './controllers/welcome.controller';

const app = Megh.createApplication();

if (app.isDevelopment()) {
  app.useOpenApi(OpenApiConfig);
}

app.useControllers([WelcomeController]);

export default app;
```
:::

The UI is then served at `routePrefix` — `http://localhost:4000/docs` above.

`isDevelopment()` is true only when `NODE_ENV=development`. With `NODE_ENV`
unset, the guard above turns the docs off.

`OpenApiUiOptions` is fully typed, so your editor completes and checks every
option, down to Swagger UI's settings. `useOpenApi` also accepts a plain
options object if you do not need a config class:

```ts
app.useOpenApi({
  info: { title: 'My API', version: '1.0.0' },
  routePrefix: '/docs',
});
```

### Options

| Option | Description |
|--------|-------------|
| `info` | Title, version and description. Defaults to `{ title: 'API', version: '1.0.0' }` |
| `routePrefix` | Where the UI is served. Defaults to `/swagger`; the JSON document is at `<routePrefix>/json` |
| `provider` | `'default'` (Swagger UI) or `'scalar'` |
| `auth` | Security scheme for `@Authorized` routes: `'bearer'`, `'apiKey'` or any OpenAPI security scheme. See [Securing routes](#securing-routes) |
| `servers` | Base URLs the API is served from |
| `tags` | Tag descriptions. Each controller is a tag, named after the class without `Controller` |
| `security` | Security requirement for every route. Prefer `auth`, which applies to `@Authorized` routes only |
| `components` | Extra schemas, responses and security schemes, merged into the generated ones |
| `externalDocs` | A link to more documentation |
| `uiConfig` | Swagger UI settings: `docExpansion`, `persistAuthorization`, `filter`, … |
| `scalar` | Scalar settings, with `provider: 'scalar'` |
| `logo` | Swagger UI top-bar logo. Defaults to the Megh logo |
| `theme` | Swagger UI `title`, `css`, `js` and `favicon`. Defaults to the Megh favicon |
| `openapi` | OpenAPI version of the document. Defaults to `3.0.3` |
| `paths` | Extra paths documented as given, for routes outside Megh |

For example, keep the "Authorize" credentials across reloads and start with
operations collapsed:

```ts
app.useOpenApi({
  info: { title: 'My API', version: '1.0.0' },
  uiConfig: { docExpansion: 'list', persistAuthorization: true },
});
```

### Logo and favicon

Swagger UI shows the Megh logo and favicon. To use your own, pass a `logo`
(an image as a string or `Buffer`, with its MIME type) and a `favicon` in `theme`:

```ts
import { readFileSync } from 'fs';

app.useOpenApi({
  info: { title: 'My API', version: '1.0.0' },
  logo: {
    type: 'image/svg+xml',
    content: readFileSync('public/logo.svg'),
    href: 'https://example.com', // where the logo links to; defaults to the app root
  },
  theme: {
    title: 'My API docs',
    favicon: [
      { filename: 'favicon.png', rel: 'icon', type: 'image/png', sizes: '32x32', content: readFileSync('public/favicon.png') },
    ],
  },
});
```

Set `logo: null` for Swagger UI's own logo.

### Scalar UI

To use [Scalar](https://scalar.com) instead of Swagger UI, install
`@scalar/fastify-api-reference` and set the provider:

```ts
app.useOpenApi({
  info: { title: 'My API', version: '1.0.0' },
  provider: 'scalar',
  scalar: { layout: 'modern', darkMode: true },
});
```

The CLI can wire this up for you — pick *Scalar UI* when running `megh new`.

## Documenting routes

Use `@OpenApi` on a controller or a route method to enrich the generated
document. The route decorators take the same options as `openapi`:
`@Get('/', { openapi: { summary: 'List users' } })`.

```ts [controllers/welcome.controller.ts]
import { ApiController, Get, OpenApi } from '@meghjs/core';

@OpenApi({ tags: ['welcome'] })
@ApiController('/welcome')
export class WelcomeController {
  @OpenApi({
    summary: 'Say hello',
    description: 'Returns a greeting.',
    response: {
      200: { description: 'A greeting' },
    },
  })
  @Get()
  sayHello() {
    return 'Hello world!';
  }
}
```

Useful `@OpenApi` fields:

| Field | Description |
|-------|-------------|
| `summary` / `description` | Human-readable text |
| `tags` | Groups the route in the UI |
| `params` / `query` / `headers` | Document inputs |
| `requestBody` | Document the body |
| `response` | Responses keyed by status code. See [Responses](#responses) |
| `deprecated` | Mark the route deprecated |
| `exclude` | Hide the route from the document |
| `security` | Per-route security requirements |

For example, documenting inputs:

```ts
@OpenApi({
  params: { id: { type: 'string', example: 'abc-123' } },
  query: { page: { type: 'integer', example: 1 } },
})
@Get('/:id')
findOne(@Param('id') id: string) {
  return { id };
}
```

### Request bodies

A `@Body()` DTO is documented automatically as a required
`application/json` body (or `multipart/form-data` when it has a
`format: 'binary'` field). Nested DTOs become `$ref`s under
`components.schemas`.

`requestBody` refines or replaces that. It only affects the document, and
validation still comes from the DTO:

```ts
// Describe the DTO body
@OpenApi({ requestBody: { description: 'The new user' } })
@Post()
create(@Body() body: CreateUserDto) {}

// Inline schema with an example; `required` defaults to true
@OpenApi({
  requestBody: {
    required: false,
    schema: { type: 'object', properties: { q: { type: 'string' } } },
    example: { q: 'megh' },
  },
})

// One schema per media type (schemas may be DTO classes)
@OpenApi({
  requestBody: {
    content: {
      'application/json': { schema: CreateUserDto },
      'text/csv': { schema: { type: 'string' } },
    },
  },
})
```

`requestBody` also takes a DTO class (`requestBody: CreateUserDto`) or a
`$ref` to `#/components/requestBodies/*`. Use `contentType` to document
`schema` under other media types, and `examples` / `encoding` as in the
OpenAPI spec.

## Responses

Document what a route returns with `@ApiResponse(status, type)`. The type is a
DTO class, a MeghORM model, `[Class]` for an array, `Paginated(Class)` for a
page, or a JSON schema:

```ts [controllers/user.controller.ts]
import { ApiController, ApiResponse, Body, Get, Paginated, Param, Post, Query } from '@meghjs/core';
import { User } from '../models/user.model';

@ApiController('/users')
export class UserController {
  @Get()
  @ApiResponse(200, Paginated(User))      // { data: User[], meta }
  index(@Query() query: ListUsersQuery) {
    return this.users.paginate(query);
  }

  @Get('/:id')
  @ApiResponse(200, User)
  @ApiResponse(404)                       // the error shape
  show(@Param('id') id: number) {
    return this.users.findOrFail(id);
  }

  @Post()
  @ApiResponse(201, { type: UserDto, description: 'The new user' })
  create(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }
}
```

A model is documented from its column decorators: each column's type,
nullability and length, and nothing else, so the schema follows the model as
it changes. A DTO is documented from its class-validator decorators, as
request bodies are. `@ApiResponse` on the controller class applies to every
route in it.

Responses are documentation only: the handler's return value is sent as it is,
so fields outside the documented schema (loaded relations, `withCount()`
counts) still reach the client. `@OpenApi({ response: { 200: User } })` works
the same way. A plain JSON schema there (`{ 200: { type: 'object', … } }`) is
also Fastify's response schema, which serializes the reply and drops fields
it doesn't list.

`megh make:resource` writes these annotations for you: a page of the model for
`index`, the model for `show`, `create` and `update`, and `404` where the
service calls `findOrFail()`.

::: info Why not from the return type?
TypeScript's types don't exist at runtime, so Megh can't read that `show()`
returns a `Promise<User>`. Name the type once in `@ApiResponse`.
:::

### Errors

Megh adds the errors a route can return from what its controller declares, so
you don't document them by hand:

| When | Response |
|------|----------|
| The route validates a `@Body()` or `@Query()` DTO | `400` with the validation error shape: `{ code, status, message, errors: [{ path, constraints }] }` |
| The route or its controller is `@Authorized` | `401` and `403` |
| `@ApiResponse(404)` (any `4xx`/`5xx`) with no type | That status with Megh's error shape: `{ code, status, message, data? }` |

An `@ApiResponse` for the same status replaces the generated one.

## Securing routes

Set `auth` and every `@Authorized` route gets the security scheme, so the
"Authorize" button applies to it and the UI shows its lock icon:

```ts
app.useOpenApi({
  info: { title: 'My API', version: '1.0.0' },
  auth: 'bearer', // Authorization: Bearer <JWT>
});
```

`'apiKey'` documents an `X-API-Key` header instead. For anything else, pass an
OpenAPI security scheme: `auth: { type: 'apiKey', in: 'query', name: 'token' }`.
Routes without `@Authorized` stay open.

## Inline routes

Routes registered with `mapGet` and friends return a chainable object, so they
can carry their own OpenAPI metadata:

```ts [app.ts]
import { Megh } from '@meghjs/core';

const app = Megh.createApplication();

app.mapGet('/', () => 'Welcome to Megh.').useOpenApi({
  tags: ['welcome'],
  summary: 'Root greeting',
});

export default app;
```

The same object also exposes `useMiddleware`:

```ts
app.mapGet('/secret', handler)
  .useMiddleware([ApiKeyMiddleware])
  .useOpenApi({ tags: ['internal'] });
```
