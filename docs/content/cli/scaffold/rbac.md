---
title: RBAC
description: Add roles and permissions to an app's users with scaffold:rbac, and check them with @Authorized.
---

# RBAC

```sh
npx megh scaffold:rbac
# shorthand
npx megh sc:rbac --roles multiple --permissions -y
```

`scaffold:rbac` adds role-based access control to an app's users without
the sign-in parts. Use it when you already authenticate users your own way,
or to add roles before running [`scaffold:auth`](/cli/scaffold/auth).
`scaffold:auth` asks the same questions and generates the same files, so you
don't need both.

| Option | Description |
|---|---|
| `--roles <mode>` | `single` or `multiple` (default `multiple`) |
| `--permissions` / `--no-permissions` | Roles grant permissions |
| `-f`, `--force` | Overwrite the generated files |
| `-y`, `--yes` | Don't prompt |

## Role Modes

| Mode | Tables | `User` model |
|---|---|---|
| `single` | `roles`, `users.role_id` | `@BelongsTo(() => Role) role` |
| `multiple` | `roles`, `user_roles` (`user_id`, `role_id`) | `@BelongsToMany(() => Role, { table: "user_roles" }) roles` |
| `--permissions` | also `permissions`, `role_permissions` | `Role` gets `@BelongsToMany(() => Permission, { table: "role_permissions" }) permissions` |

A role has a `name`, a unique `slug` and a `description`; a permission has a
unique `name` such as `users.manage`, a `group` and a `description`. Without
a `users` table, one is created from the `common/user` template; an existing
one gets `role_id` through an alter-table migration.

## Generated Files

| File | Contents |
|---|---|
| `src/database/migrations/*` | The tables above |
| `src/models/role.model.ts`, `permission.model.ts` | The models, and the relations on `User` |
| `src/auth/rbac.ts` | Role and permission helpers |
| `src/auth/authorization.ts` | `AppAuthorization`, registered in `src/app.ts` with `app.useAuthorization()` |
| `src/database/seeders/roles.seeder.ts` | The `admin` and `user` roles, and their permissions |

Create the tables and roles:

```sh
npx megh migrate --seed
```

The seeder finds roles and permissions by slug and name before creating
them, so it is safe to run again. Edit its `ROLES` and `PERMISSIONS` to fit
your app:

```ts [src/database/seeders/roles.seeder.ts]
const ROLES = [
  { name: "Admin", slug: "admin", description: "Full access" },
  { name: "User", slug: "user", description: "A signed-up user" },
];

/** Permissions per role slug. Check them with @Authorized({ permissions: [...] }). */
const PERMISSIONS: Record<string, string[]> = {
  admin: ["users.view", "users.manage", "roles.manage"],
  user: [],
};
```

## Checking Roles

On a route:

```ts
@Authorized({ roles: ['admin', 'editor'] })      // any of these roles
@Authorized({ permissions: ['posts.publish'] })  // any of these permissions
```

A caller without a user gets 401 and one without the role or permission 403.
Roles match by slug or name.

In code, with the helpers from `src/auth/rbac.ts`:

```ts
import { assignRole, hasPermission, hasRole } from '../auth/rbac';

if (await hasRole(user, ['admin'])) { /* ... */ }
if (await hasPermission(user, ['posts.publish'])) { /* ... */ }

await assignRole(user, 'editor');   // false if there is no such role
```

The helpers use the roles (and permissions) already loaded on the user, as
the generated `AppAuthentication` loads them, and query them otherwise.

## Request User

`AppAuthorization` reads `request.user`, which an
[authentication handler](/core-concept/authentication) sets. `scaffold:auth`
generates one. With your own, return a `User`, ideally with its roles loaded
so the checks don't query them on every request:

```ts
return User.with('roles.permissions').where('id', id).first();
```

To manage roles over HTTP, generate resources for them:

```sh
npx megh make:resource role
npx megh make:resource permission
```

and protect them with `@Authorized({ roles: ['admin'] })` on the controller
class.
