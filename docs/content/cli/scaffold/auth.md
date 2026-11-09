---
title: Auth
description: Scaffold sign-up and sign-in with JWTs, API keys or both, and optionally roles and permissions, with scaffold:auth.
---

# Auth

```sh
npx megh scaffold:auth
# shorthand
npx megh sc:auth
```

You are asked three things:

1. **How clients sign in:** JWT, API keys, or both.
2. **Roles:** none, single (one role per user, `users.role_id`), or multiple
   (any number per user, the `user_roles` table).
3. **Permissions:** whether roles grant permissions (with roles only).

Or give the answers as options:

```sh
npx megh sc:auth --strategy jwt -y
npx megh sc:auth --strategy both --roles multiple --permissions -y
npx megh sc:auth --strategy api-key --roles single --no-permissions -y
```

| Option | Description |
|---|---|
| `--strategy <strategy>` | `jwt`, `api-key` or `both` (default `jwt`) |
| `--roles <mode>` | `none`, `single` or `multiple` (default `none`) |
| `--permissions` / `--no-permissions` | Roles grant permissions |
| `-f`, `--force` | Overwrite the generated auth files |
| `-y`, `--yes` | Don't prompt |

JWTs use [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken), which the
command tells you to install:

```sh
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

Then create the tables and the roles:

```sh
npx megh migrate --seed
```

## Routes

| Route | Body | Response |
|---|---|---|
| `POST /auth/register` | `{ name, email, password }` | Same as login |
| `POST /auth/login` | `{ email, password }` | JWT: `{ token_type: "Bearer", access_token, expires_in, user }`. API keys only: `{ api_key, user }` |
| `GET /auth/me` | | The signed-in user, with their roles |
| `GET /auth/api-keys` | | The user's active keys (API keys) |
| `POST /auth/api-keys` | `{ name, expires_at? }` | The new key, with `key` shown this once (API keys) |
| `DELETE /auth/api-keys/:id` | | Revokes a key (API keys) |

Send the token as `Authorization: Bearer <access_token>`, or the key as
`X-API-Key: <key>`. A wrong password and an unknown email both answer
`401 Invalid email or password.`; a registered email answers 400. Passwords
need at least 8 characters.

```sh
curl -X POST localhost:4000/auth/login -H 'content-type: application/json' \
  -d '{"email":"ann@example.com","password":"secret123"}'

curl localhost:4000/auth/me -H "authorization: Bearer $TOKEN"
```

## Protecting Routes

```ts
import { ApiController, Authorized, AuthUser, Get, type Row } from '@meghjs/core';
import type { User } from '../models/user.model';

@ApiController('/orders')
export class OrderController {
  @Authorized()                                 // signed in, else 401
  @Get()
  mine(@AuthUser() user: Row<User>) { /* ... */ }

  @Authorized({ roles: ['admin'] })             // and an admin, else 403
  @Get('/all')
  all() { /* ... */ }

  @Authorized({ permissions: ['orders.manage'] })
  @Get('/export')
  export() { /* ... */ }
}
```

`@Authorized()` on the controller class protects all of its routes. Roles
match by slug or name; see [RBAC](/cli/scaffold/rbac).

## Generated Files

| File | Contents |
|---|---|
| `src/database/migrations/*` | `users`, and as chosen `roles`, `user_roles` or `users.role_id`, `permissions` with `role_permissions`, `api_keys` |
| `src/models/*.model.ts` | `User` (with its `roles` / `role` relation), `Role`, `Permission`, `ApiKey` |
| `src/auth/password.ts` | `hashPassword()` / `verifyPassword()` with scrypt, built into Node.js |
| `src/auth/jwt.ts` | `signToken()` / `verifyToken()`: HS256 with `JWT_SECRET` |
| `src/auth/api-keys.ts` | `generateApiKey()` / `hashApiKey()` |
| `src/auth/authentication.ts` | `AppAuthentication`: reads the token or key and sets `request.user`, with its roles loaded |
| `src/auth/authorization.ts` | `AppAuthorization`: the checks behind `@Authorized(...)` |
| `src/auth/rbac.ts` | `rolesOf()`, `hasRole()`, `permissionsOf()`, `hasPermission()`, `assignRole()` |
| `src/dtos/auth.dto.ts` | `RegisterDto`, `LoginDto`, `CreateApiKeyDto` |
| `src/services/auth.service.ts` | `AuthService`: register, login and API keys |
| `src/controllers/auth.controller.ts` | `AuthController`: the routes above |
| `src/database/seeders/roles.seeder.ts` | The `admin` and `user` roles (and permissions), safe to run again |

It also updates:

- **`src/app.ts`**: registers the handlers and the controller.

  ```ts
  app.useAuthentication(AppAuthentication);
  app.useAuthorization(AppAuthorization);

  app.useControllers([HomeController, AuthController]);
  ```

- **`.env`**: `JWT_SECRET` (a random 96-character key) and `JWT_EXPIRES_IN=1d`.
  `.env.example` gets the names without the secret.
- **`src/config/openapi.config.ts`**: `auth: 'bearer'` (`'apiKey'` with API
  keys only), for the Authorize button of the [docs page](/microservices/openapi).
- **`src/database/seeders/database.seeder.ts`**, if you have one: calls
  `"roles"`, so `db:seed` runs it.

New users get the `user` role. `User` and `ApiKey` leave the password,
remember token and key hash out of their JSON, so responses never contain
them.

## Security

- Passwords are hashed with scrypt and a random salt, and compared in
  constant time.
- Only the SHA-256 hash of an API key is stored. A key is shown once, when it
  is created; revoked and expired keys are refused.
- Tokens are signed with HS256 and verified with only that algorithm. Keep
  `JWT_SECRET` out of version control. A JWT can't be revoked before it
  expires, so keep `JWT_EXPIRES_IN` short or use API keys where you need
  revocation.
- Deactivated users (`is_active = false`) can't sign in, and their tokens
  stop working.
- Not included: refresh tokens, email verification, password reset and rate
  limiting on login.

## An Existing Users Table

If a migration already creates `users`, it is kept. An alter-table migration
adds the columns sign-in needs and the table lacks (`email`, `password`, and
`role_id` for a single role), as nullable columns since the table may have
rows. The `User` model is updated with
[`update:model`](/cli/generators#updating-a-model), and the generated code only
uses columns the table has.

## Running It Again

Generated files aren't overwritten: running `scaffold:auth` again fails with
the files that exist. Pass `-f` to regenerate them, e.g. to switch from JWT to
both. Migrations and models are never rewritten, and nothing is registered
twice. A file that already has exactly the content it would get, such as
`rbac.ts` from an earlier [`scaffold:rbac`](/cli/scaffold/rbac) with the same
roles, is kept.

See [Authentication](/core-concept/authentication) for how
`MeghAuthentication` and `@Authorized` work.
