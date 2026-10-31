---
title: OpenAPI
description: Generating API documentation from your controllers.
---

# OpenAPI

Avleon generates an OpenAPI document from your controllers and serves a browsable
UI. Since 0.3 the UI packages are optional peer dependencies. Install the one you
use:

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
npx avleon make:config openapi
```

::: code-group
```ts [config/openapi.config.ts]
import { AppConfig, AvleonConfig, Environment, OpenApiUiOptions } from '@avleon/core';

@AppConfig
export class OpenApiConfig extends AvleonConfig<OpenApiUiOptions> {
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
import { Avleon } from '@avleon/core';
import { OpenApiConfig } from './config/openapi.config';
import { WelcomeController } from './controllers/welcome.controller';

const app = Avleon.createApplication();

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

`useOpenApi` also accepts a plain options object if you do not need a config
class:

```ts
app.useOpenApi({
  info: { title: 'My API', version: '1.0.0' },
  routePrefix: '/docs',
});
```

### Options

| Option | Description |
|--------|-------------|
| `info` | Title, version, description |
| `routePrefix` | Where the UI is served. Defaults to `/docs` |
| `provider` | `'default'` (Swagger UI) or `'scalar'` |
| `servers` | Server URLs |
| `tags` | Tag definitions |
| `security` | Global security requirements |
| `components` | Reusable schemas and security schemes |

### Scalar UI

To use [Scalar](https://scalar.com) instead of Swagger UI, install
`@scalar/fastify-api-reference` and set the provider:

```ts
app.useOpenApi({
  info: { title: 'My API', version: '1.0.0' },
  provider: 'scalar',
});
```

The CLI can wire this up for you — pick *Scalar UI* when running `avleon new`.

## Documenting routes

Use `@OpenApi` on a controller or a route method to enrich the generated
document.

```ts [controllers/welcome.controller.ts]
import { ApiController, Get, OpenApi } from '@avleon/core';

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
| `response` | Responses keyed by status code |
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
    example: { q: 'avleon' },
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

## Inline routes

Routes registered with `mapGet` and friends return a chainable object, so they
can carry their own OpenAPI metadata:

```ts [app.ts]
import { Avleon } from '@avleon/core';

const app = Avleon.createApplication();

app.mapGet('/', () => 'Welcome to Avleon.').useOpenApi({
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
