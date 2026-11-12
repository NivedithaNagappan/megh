---
title: Middleware
description: Creating and applying Megh middleware.
---

# Middleware

Middleware runs before your route handler and can inspect or modify the request,
or reject it outright.

```sh
npx megh make:middleware logger
```

The command generates:

```ts [src/middlewares/logger.middleware.ts]
import { AppMiddleware, MeghMiddleware, IRequest, IResponse } from '@meghjs/core';

@AppMiddleware
export class LoggerMiddleware extends MeghMiddleware {
  /**
   * Return the request to continue, or throw to stop the pipeline.
   */
  async invoke(req: IRequest, res?: IResponse) {
    console.log('url:', req.url);
    return req;
  }
}
```

A middleware extends `MeghMiddleware` and implements `invoke`. Returning the
request continues the pipeline; throwing an `HttpExceptions` error stops it:

```ts
import { AppMiddleware, MeghMiddleware, IRequest, HttpExceptions } from '@meghjs/core';

@AppMiddleware
export class ApiKeyMiddleware extends MeghMiddleware {
  async invoke(req: IRequest) {
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
      throw HttpExceptions.unauthorized('Invalid API key');
    }
    return req;
  }
}
```

## Applying middleware

Middleware can be applied at three levels.

### Global

Runs for every request. Note the plural — `useMiddlewares`:

```ts [app.ts]
import { Megh } from '@meghjs/core';
import { LoggerMiddleware } from './middlewares/logger.middleware';

const app = Megh.createApplication();

app.useMiddlewares([LoggerMiddleware]);

export default app;
```

### Controller scoped

Runs for every route on that controller:

```ts
import { ApiController, Get, UseMiddleware } from '@meghjs/core';
import { LoggerMiddleware } from '../middlewares/logger.middleware';

@UseMiddleware(LoggerMiddleware)
@ApiController('/home')
export class HomeController {
  @Get()
  sayHello() {
    return 'Hello';
  }
}
```

### Route scoped

Runs for a single route:

```ts
import { ApiController, Get, UseMiddleware } from '@meghjs/core';
import { LoggerMiddleware } from '../middlewares/logger.middleware';

@ApiController('/home')
export class HomeController {
  @UseMiddleware(LoggerMiddleware)
  @Get()
  sayHello() {
    return 'Hello';
  }
}
```

A class is resolved through the DI container when the route is registered, so
it can use constructor injection. You can also pass an instance, for example to
give it settings. `UseMiddleware` also accepts an array, and both forms can be
mixed:

```ts
@UseMiddleware([LoggerMiddleware, new RateLimitMiddleware(100)])
```

::: tip
Passing a class to `@UseMiddleware` crashed `app.run()` before 0.5.2.
:::

::: info
`@UseMiddleware` must sit above `@ApiController` on a class, and above the route
decorator on a method — decorators apply bottom-up.
:::

## Pipeline order

Each request passes through these stages:

1. Global middlewares (`useMiddlewares`)
2. Class `@UseMiddleware`, then method `@UseMiddleware`
3. Authentication (sets `request.user`)
4. Class `@Authorized`, then method `@Authorized`
5. Parameter and DTO validation
6. The route handler

Middleware runs before authentication, so it can reject a request early (an
API key check, an IP allowlist) but cannot read `request.user`. Put checks
that need the user in an authorization handler. Inline routes follow the
same order.

::: warning Changed in 0.5.5
`@UseMiddleware` used to run after `@Authorized`. See
[Upgrading to 0.5.5](/getting-started/upgrading-0.5#breaking-in-0-5-5).
:::

See [Authentication](/core-concept/authentication) for steps 3 and 4.
