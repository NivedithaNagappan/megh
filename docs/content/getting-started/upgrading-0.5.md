---
title: Upgrading to 0.5.2
description: What changes in Megh 0.5.1 and 0.5.2 - useMeghORM, decorator models, the schema builder, the DB query builder, Megh's own DI container, and fixes for scoped middleware and SQL Server paging.
---

# Upgrading to 0.5.2

0.5.1 and 0.5.2 need no code changes: apps written for 0.5.0 keep working.
0.5.1 brings Megh's own ORM setup and DI container, and deprecates
`app.useDatabase()`. 0.5.2 is a bug-fix release.

```sh
npm i @meghjs/core@^0.5.2
npm i -D @meghjs/cli@^0.5.2
```

## Fixes in 0.5.2

- **`@UseMiddleware(SomeClass)` works.** Passing a middleware class to
  `@UseMiddleware` on a controller or route crashed `app.run()` with
  `Function is not registered`. Classes are now resolved through the DI
  container, so they can use constructor injection. The
  `@UseMiddleware(new SomeClass())` workaround still works. See
  [Middleware](/core-concept/middleware#controller-scoped).
- **Paging works on SQL Server.** `limit()`, `offset()`, `first()`, `find()`,
  `exists()`, `paginate()`, `simplePaginate()` and `forPage()` failed with
  `Incorrect syntax near 'limit'`. Queries now use `top(n)` and
  `offset … fetch next … rows only` on SQL Server. See
  [Paging on SQL Server](/advanced/orm#paging-on-sql-server).

## Changes in 0.5.1

### Connect with `useMeghORM()`

Megh now creates the database connection itself. Kysely ships with
`@meghjs/core`, so an app only installs the driver for its database.

```ts [src/app.ts]
// Before (0.5.0)
import { db } from "./database/connection";
app.useDatabase(db);

// After (0.5.1+)
app.useMeghORM(); // reads DATABASE_URL, or pass { dialect, host, ... }
```

1. Put the connection in `.env`, for example
   `DATABASE_URL=postgres://app:secret@localhost:5432/app`.
   [Connecting](/advanced/orm#connecting) lists every option and variable.
2. Replace `app.useDatabase(db)` with `app.useMeghORM()`.
3. Delete `src/database/connection.ts`, and a `"database"` path under `"megh"`
   in `package.json` if you set one. While that file exists, `megh migrate`
   keeps using it; once it's gone, migrations connect from `DATABASE_URL` too.
4. Uninstall `kysely` unless your own code imports it.

`app.useDatabase(db)` still works in 0.5.x and logs a deprecation warning.

### Models with decorators

Models can describe their table with decorators. Models written with
`static table` and `hasMany(() => Post)` keep working, so move them over
when it suits you.

```ts
@Table("users")
export class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column({ unique: true }) email!: string;
  @Column({ name: "display_name" }) displayName!: string;
  @CreatedAt() createdAt?: Date;

  @HasMany(() => Post) posts!: HasMany<Post>;
}
```

- Fields marked `?` are optional in `create()`.
- `@Column({ name })`, or `useMeghORM({ naming: 'snake_case' })`, maps
  camelCase properties to other column names. See
  [Column names](/advanced/orm#column-names).
- `npx megh make:model` now writes decorator models.

### Migrations with the schema builder

`npx megh make:migration` now writes migrations with Megh's schema builder,
which picks the right SQL type for each database:

```ts
export default defineMigration({
  async up(schema) {
    await schema.create("users", (table) => {
      table.id();
      table.string("email").unique();
      table.timestamps();
    });
  },
  async down(schema) {
    await schema.dropIfExists("users");
  },
});
```

Existing Kysely migrations (`export async function up(db)`) still run, in
order with the new ones.

### The `DB` query builder

For queries that don't need a model:

```ts
import { DB } from "@meghjs/core";

const ids = await DB.table("users").where("active", true).pluck("id");
await DB.transaction(async () => {
  /* ... */
});
```

See [Query builder](/advanced/orm#query-builder).

### Megh's own DI container

`typedi` is no longer a dependency. `MeghContainer`, `@Injectable()`, `Token`
and `inject()` keep their API, and `inject()` now also works in field
initializers:

```ts
@Injectable()
class UserService {
  private readonly users = inject(UserRepository);
  private readonly mailer = inject(Mailer, { optional: true });
}
```

If your app imported `typedi` directly, switch to `MeghContainer` or add
`typedi` to your own dependencies. Missing services and dependency cycles now
fail with the full constructor chain in the error. See
[Dependency Injection](/core-concept/dependency-injection).

### `megh new`

New projects can include the ORM: pick **MeghORM** from the features, or pass
`--database postgres|mysql|sqlite|mssql`.
