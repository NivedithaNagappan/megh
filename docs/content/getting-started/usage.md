---
title: Usage
description: How to create a basic megh application.
---

# Usage

There are two ways to design your application: `Controller based` and
`Route method based`. They can be mixed in the same app.

## Using Controller

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

## Using Inline Route

For small apps, register handlers directly on the app with `mapGet`, `mapPost`,
`mapPut` and `mapDelete`:

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

Inline routes return a chainable object for middleware and OpenAPI metadata:

```ts
app.mapGet('/secret', handler)
  .useMiddleware([ApiKeyMiddleware])
  .useOpenApi({ tags: ['internal'] });
```

## Returning responses

Returning an object or array sends JSON; returning a string sends it as-is.
To send an error status, throw an `HttpExceptions` error:

```ts
import { HttpExceptions } from '@meghjs/core';

throw HttpExceptions.notFound('User not found');
```

Error responses have the shape `{ code, status: "Error", message, data? }`.
Outside development, 5xx responses hide the message and data.

::: info
In 0.3.0, `Results.Created`, `Results.NoContent`, `HttpResponse.Created`
and `@HttpCode` do not change the status code yet; the response is 200. See
[Known issues](/getting-started/upgrading#known-issues-in-0-3-0).
:::

Inline routes skip authentication, `@Authorized` checks and DTO validation.
Use a controller when you need them.

## Running the app

`run` takes an optional port, defaulting to `4000`:

```ts
app.run();      // :4000
app.run(3000);  // :3000
```

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
scheduler and queue workers, then runs the `onClose` hooks. Calling it twice
is safe.

## Development and production

`app.isDevelopment()` is true only when `NODE_ENV=development`. An unset
`NODE_ENV` counts as production. In production mode, 5xx details are hidden
and logs are written as JSON. Set `NODE_ENV=development` locally to get
detailed errors, pretty logs and any docs you gate behind `isDevelopment()`.

`run()` binds to localhost. On `SIGTERM` or `SIGINT` it calls `app.close()`
before exiting.

## Next steps

- [Controller](/core-concept/controller) — routes, parameters, REST resources
- [Middleware](/core-concept/middleware) — request pipeline
- [Database](/advanced/database) — TypeORM and Knex
- [OpenAPI](/microservices/openapi) — API documentation
