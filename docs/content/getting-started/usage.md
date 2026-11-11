---
title: Quick Start
description: Writing your first routes, with a controller or inline, returning responses and running the app.
---

# Quick Start

There are two ways to design your application: `Controller based` and
`Route method based`. They can be mixed in the same app.

## Using a controller

Controllers group related routes and can take dependencies through the
constructor. This is the approach the CLI scaffolds.

::: code-group
```ts [app.ts]
import { Megh } from '@meghjs/core';
import { WelcomeController } from './controllers/welcome.controller';

const app = Megh.createApplication();
app.useControllers([ WelcomeController ]);

app.run();
```

```ts [controllers/welcome.controller.ts]
import { ApiController, Get } from '@meghjs/core';

@ApiController
export class WelcomeController {

    @Get()
    sayHello(){
        return 'Hello world!.';
    }
}
```
:::

See [Controller](/core-concept/controller) for parameters, REST resources and
error handling.

## Using inline routes

For small apps, register handlers directly on the app with `mapGet`, `mapPost`,
`mapPut`, `mapPatch` and `mapDelete`:

::: code-group
```ts [app.ts]
import { Megh } from '@meghjs/core';

const app = Megh.createApplication();

app.mapGet('/', () => 'Welcome to Megh.');

app.run(); // by default run on :4000
```
:::

Handlers receive the request and response, and returning an object sends JSON:

```ts
app.mapGet('/users/:id', (req) => ({ id: req.params.id }));

app.mapPost('/users', (req) => {
  return { created: req.body };
});
```

Inline routes return a chainable object for middleware, authorization and
OpenAPI metadata:

```ts
app.mapGet('/secret', handler)
  .useMiddleware([ApiKeyMiddleware])  // classes (resolved through DI) or instances
  .authorized()                       // like @Authorized(); .authorized('jwt') picks a handler
  .useOpenApi({ tags: ['internal'] });
```

They run the same pipeline as controller routes: middleware, then the
authentication handler (`request.user`), then `.authorized()`. Return
`Results.*` to set the status code; thrown errors go through the
[error handler](/core-concept/error-handling).

## Returning responses

Returning an object or array sends JSON; returning a string sends it as-is.

Set the status code with `@HttpCode`, or return a result that carries one:

```ts
import { Post, Get, HttpCode, Results, HttpResponse } from '@meghjs/core';

@Post('/')
@HttpCode(201)
create(@Body() dto: CreateUserDto) {
  return this.users.create(dto);          // 201 with the user as JSON
}

@Get('/:id')
async findOne(@Param('id') id: number) {
  const user = await this.users.find(id);
  return user ? Results.Ok(user)          // 200 { data: user }
              : Results.NotFound('nope'); // 404 { code, status, message }
}
```

| Result | Status | Body |
|--------|--------|------|
| `Results.Ok(x)` | 200 | `{ data: x }` |
| `Results.Created(x)` | 201 | `{ data: x }` |
| `Results.NoContent()` | 204 | empty |
| `Results.NotFound(msg)` | 404 | `{ code, status, message }` |
| `Results.OkStream(stream, { contentType, filename })` | 200 | the stream |
| `HttpResponse.Created(x)` | 201 | `{ message, data }` |
| `HttpResponse.NoContent()` | 204 | empty |

A returned result's status wins over `@HttpCode`.

To send an error status, throw an HTTP exception:

```ts
import { HttpExceptions } from '@meghjs/core';

throw HttpExceptions.notFound('User not found');
```

Error responses have the shape `{ code, status: "Error", message, data? }`.
Outside development, 5xx responses hide the message and data. See
[Error Handling](/core-concept/error-handling).

Inline routes don't validate DTOs; use a controller when you need that.

## Running the app

`run` takes an optional port, defaulting to `4000`:

```ts
app.run();      // :4000
app.run(3000);  // :3000
app.run(3000, { host: '127.0.0.1' });
```

The host defaults to the `HOST` environment variable, else `0.0.0.0`, so
the app is reachable inside a container. Pass `127.0.0.1` to accept local
connections only.

| Option | Default | |
|--------|---------|---|
| `host` | `HOST` or `0.0.0.0` | Interface to listen on |
| `onListen` | | Called once the server is listening |
| `shutdownTimeout` | `10000` | Milliseconds to wait for a clean shutdown before exiting with code 1 |

Read the port from the environment to make it configurable:

```ts [serve.ts]
import { Environment, inject } from '@meghjs/core';
import app from './app';

async function serve() {
  const env = inject(Environment);
  await app.run(env.get<number>('PORT') || 4000);
}

serve();
```

## Lifecycle hooks

Register work to run at each stage of the app's life. Call these before
`run()`; each returns the app, so they chain:

```ts
app
  .onInit(async () => {
    // After the database connects, before routes are mapped and the server
    // listens. A thrown error aborts startup.
    await cache.warmUp();
  })
  .onReady(() => {
    // The server is listening.
    console.log('ready');
  })
  .onClose(async () => {
    // On shutdown, after the server stops accepting requests.
    await metrics.flush();
  });
```

Hooks of the same kind run in the order you register them, except `onClose`
hooks, which run in reverse so that things set up last are torn down first. A
failing `onClose` hook is logged and the others still run.

`await app.close()` shuts the app down yourself, for example at the end of a
test. It stops the HTTP server (waiting for in-flight requests), the
scheduler, queue workers and the cache, then runs the `onClose` hooks.
Calling it twice is safe.

## Development and production

`app.isDevelopment()` is true only when `NODE_ENV=development`. An unset
`NODE_ENV` counts as production. In production mode, 5xx details are hidden
and logs are written as JSON. Set `NODE_ENV=development` locally to get
detailed errors, pretty logs and any docs you gate behind `isDevelopment()`.

On `SIGTERM` or `SIGINT`, `run()` calls `app.close()` and exits with code 0.
If shutdown fails, or takes longer than `shutdownTimeout`, it exits with
code 1.

Megh loads `.env` into `process.env` when it is first imported. Set
`MEGH_DOTENV=false` to skip that and manage the environment yourself.

## Next steps

- [Controller](/core-concept/controller) — routes, parameters, REST resources
- [Middleware](/core-concept/middleware) — request pipeline
- [MeghORM](/advanced/orm) — models, queries, relations and migrations
- [OpenAPI](/microservices/openapi) — API documentation
