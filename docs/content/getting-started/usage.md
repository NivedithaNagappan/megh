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

Set `NODE_ENV=development` locally to get detailed errors and pretty logs. An
unset `NODE_ENV` counts as production.

See [Application](/getting-started/application) for the app options, the
`use*` methods, what `run()` does, lifecycle hooks and shutdown.

## Next steps

- [Application](/getting-started/application) — options, lifecycle and shutdown
- [Controller](/core-concept/controller) — routes, parameters, REST resources
- [Middleware](/core-concept/middleware) — request pipeline
- [MeghORM](/advanced/orm) — models, queries, relations and migrations
- [OpenAPI](/microservices/openapi) — API documentation
