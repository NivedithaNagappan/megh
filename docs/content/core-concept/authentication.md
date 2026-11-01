---
title: Authentication
description: Identifying callers and protecting routes.
---

# Authentication

Megh splits access control into two steps:

- **Authentication** works out *who* the caller is and sets `request.user`.
- **Authorization** decides whether that caller may use a route marked
  `@Authorized`.

## Authentication

Extend `MeghAuthentication` and return the user, or `null` for an anonymous
request. Whatever you return becomes `request.user`:

```ts [auth/jwt.authentication.ts]
import { MeghAuthentication, AppService, IRequest } from '@meghjs/core';

@AppService
export class JwtAuthentication extends MeghAuthentication<User> {
  async authenticate(request: IRequest) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return verifyToken(header.slice(7));
  }
}
```

Register it once:

```ts [app.ts]
app.useAuthentication(JwtAuthentication);
```

Read the user in a handler with `@AuthUser()`:

```ts
@ApiController('/me')
export class MeController {
  @Get()
  whoami(@AuthUser() user: User) {
    return user;
  }
}
```

Authentication never rejects a request by itself. Use authorization for that.

## Authorization

Authorization is **deny-by-default**. Write a class with an `authorize` method
and mark it `@CanAuthorize`:

```ts [auth/jwt.authorization.ts]
import { CanAuthorize, IRequest, HttpExceptions } from '@meghjs/core';

@CanAuthorize
export class JwtAuthorization {
  async authorize(req: IRequest, options?: { roles?: string[] }) {
    if (!req.user) throw HttpExceptions.unauthorized('Login required'); // 401
    if (options?.roles && !options.roles.includes(req.user.role)) {
      return false; // 403
    }
  }
}
```

| `authorize` result | Response |
|--------------------|----------|
| returns `false` | 403 |
| throws an `HttpExceptions` error | that error's status |
| returns anything else (including nothing) | request continues |

Register it:

```ts [app.ts]
app.useAuthorization(JwtAuthorization);
```

### Protecting routes

```ts
// every route in the controller
@Authorized()
@ApiController('/admin')
export class AdminController {
  @Get()
  dashboard(@AuthUser() user: User) {
    return user;
  }
}

// one route, with options passed to authorize()
@ApiController('/reports')
export class ReportsController {
  @Authorized({ roles: ['admin'] })
  @Get('/stats')
  stats() {}
}
```

::: warning
If no authorizer is registered, Megh logs a warning at boot and every
`@Authorized` route answers **403**.
:::

### Multiple strategies

Register several authorizers by name and choose one per route:

```ts
app.useAuthorization({ jwt: JwtAuthorization, apiKey: ApiKeyAuthorization });

@Authorized('apiKey')                            // by name
@Authorized({ name: 'jwt', roles: ['admin'] })  // by name, with options
```

`@Authorized()` with no name uses the first registered handler. Naming a
handler that is not registered makes `app.run()` fail at boot.

## Order of checks

Global middlewares run first, then authentication, then the class and method
`@Authorized` checks, then `@UseMiddleware`, then validation. See
[Middleware](/core-concept/middleware#pipeline-order).
