---
title: Upgrading to 0.4
description: Breaking changes from 0.3 and what is new in 0.4.
---

# Upgrading to 0.4

::: info Avleon is now Megh
This guide predates the rename and uses the old `@avleon/*` names. After
upgrading, follow [Moving from Avleon to Megh](/getting-started/upgrading-megh).
:::

0.4 moves the database integrations into their own package, adds plugins and
lifecycle hooks, and fixes security issues in optional dependencies. `@avleon/core`,
`@avleon/cli` and the new `@avleon/data` are released together and share a
version, so upgrade them together:

```sh
npm i @avleon/core@^0.4.1 @avleon/cli@^0.4.1
```

## 1. TypeORM and Knex moved to `@avleon/data`

If your app uses `useTypeORM`, `useKnex` or any database helper, install the
new package:

```sh
npm i @avleon/data@^0.4.0
```

`app.useTypeORM()` and `app.useKnex()` keep their signatures. They are added by
the `@avleon/data` [plugin](/advanced/plugins), which the app finds among its
dependencies, so there is nothing to import or register. For TypeScript to see
the methods, add this file and include it in `tsconfig.json`:

```ts [avleon-env.d.ts]
/// <reference types="@avleon/data" />
```

```json [tsconfig.json]
{
  "include": ["avleon-env.d.ts", "src/**/*"]
}
```

Import the database APIs from `@avleon/data` instead of `@avleon/core`:

```ts
// Before
import { InjectRepository, KnexDB, AvleonRepository, Like } from '@avleon/core';
// After
import { InjectRepository, KnexDB, AvleonRepository, Like } from '@avleon/data';
```

That covers `InjectRepository`, `PaginatedRepository`, `AvleonRepository`,
`Repository`, the query operators (`Like`, `ILike`, `In`, `Not`, `Between`, …),
`KnexDB`, `AVLEON_KNEX_DB`, `paginateKnex`, `registerDataSource`,
`getDataSource` and `DATASOURCE_TOKEN`. `Collection`, `List` and the
pagination helpers stay in `@avleon/core`.

Also changed:

- `Collection.fromRepository(Entity)` is now `paginatedRepository(Entity)` from
  `@avleon/data`.
- `useDatasource()`, the `dataSourceOptions` application option and the
  `dataSource` option of `createTestApplication` are removed. Use
  `await app.useTypeORM(options)`.
- The connection opened by `useTypeORM` or `useKnex` is now closed when the app
  shuts down.

## 2. Upgrade `@fastify/static` and `@fastify/swagger-ui`

Every 8.x and 9.x release of `@fastify/static` is vulnerable to path
traversal, so core now requires patched versions of these optional peers. If
you use `useStaticFiles` or Swagger UI:

```sh
npm i @fastify/static@^10.1.2 @fastify/swagger-ui@^6.1.2
```

## 3. `MockDB` is removed

`MockDB` called the global `jest.fn()` and only worked under Jest. Mock your
data layer with your test framework instead.

## 4. Dependency injection

Avleon now has its own container API. Use it rather than importing `typedi`,
which may be replaced:

| Use | For |
|-----|-----|
| `AvleonContainer.get / set / has / reset` | Resolving and registering values |
| `@Injectable()` | Classes the container constructs (as `@AppService` does) |
| `new Token<T>('name')` | Values that are not classes |

`AvleonContainer` no longer exposes the rest of typedi's API, and
`@Utility()` / `@Helper()` no longer take typedi options. `AvleonContainer.reset()`
no longer calls `destroy()` on the instances it discards.

## 5. New projects use Vitest

`avleon new` now scaffolds Vitest instead of Jest, with SWC for decorator
metadata. Existing projects are not changed.

## What's new

- [Lifecycle hooks](/getting-started/usage#lifecycle-hooks): `app.onInit`,
  `app.onReady`, `app.onClose`, and `app.close()` for a clean shutdown.
- [Plugins](/advanced/plugins): packages can add `app.use*` methods, services
  and hooks, and are found automatically once installed.

### 0.4.1

- [Models (ORM)](/advanced/orm): type-safe models built on Kysely, with
  relations and eager loading, timestamps, soft deletes, casts and
  transactions. Connect them with `app.useDatabase(db)`.
- [Migrations](/advanced/orm#migrations): `avleon make:migration` and the
  `migrate`, `migrate:status`, `migrate:rollback`, `migrate:reset` and
  `migrate:refresh` [commands](/cli/basic#migrations).
- The generated [OpenAPI](/microservices/openapi) spec now documents request
  bodies.

The full list of changes is in the
[changelog](https://github.com/avleonjs/avleon/blob/main/packages/core/CHANGELOG.md).
