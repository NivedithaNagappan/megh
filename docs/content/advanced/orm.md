---
title: MeghORM
description: Megh's built-in, type-safe ORM on Kysely. Installing a driver, connecting, and where to find models, queries, relations, migrations and seeding.
---

# MeghORM

`@meghjs/core` includes its own ORM. You describe tables with decorators, and
column names, value types and loaded relations are checked by TypeScript. Use
it through models, or as a query builder when you need SQL-level control.

```ts
const users = await User.where('email', 'like', '%@acme.io')
  .with('posts.comments')
  .orderBy('name')
  .get();

users[0].posts[0].comments[0].body; // typed
User.where('emial', 'x');           // compile error: '"emial"' is not assignable to '"id" | "email" | "name"'
```

These pages cover everything the ORM does, so you don't need another library's docs.

## Installation

The ORM ships with `@meghjs/core`. Install only the driver for your database:

::: code-group
```sh [PostgreSQL]
npm i pg
```
```sh [MySQL]
npm i mysql2
```
```sh [SQLite]
npm i better-sqlite3
```
```sh [SQL Server]
npm i tedious tarn
```
:::

## Connecting

Call `useMeghORM()` with the connection settings. Megh creates the connection
and its pool, checks it when the app starts, and closes it on shutdown:

```ts [app.ts]
import { Megh } from '@meghjs/core';

const app = Megh.createApplication();
app.useMeghORM({ dialect: 'postgres', url: process.env.DATABASE_URL });
```

With no arguments, the settings come from the environment (and `.env`), which
is also where the [migration commands](/advanced/orm/migrations) read them:

```sh [.env]
DATABASE_URL=postgres://app:secret@localhost:5432/app
```

```ts
app.useMeghORM(); // reads DATABASE_URL
```

The URL scheme picks the database, so `dialect` is optional with a URL:

| Database | URL |
|---|---|
| PostgreSQL | `postgres://user:pass@host:5432/db` |
| MySQL / MariaDB | `mysql://user:pass@host:3306/db` |
| SQL Server | `mssql://user:pass@host:1433/db` (or `sqlserver://`). Add `?encrypt=false` or `?trustServerCertificate=true` for local servers |
| SQLite | `sqlite:./database.sqlite`, or `sqlite::memory:` |

Instead of a URL, give the parts:

```ts
app.useMeghORM({
  dialect: 'mysql',
  host: 'localhost',
  port: 3306,
  user: 'app',
  password: process.env.DB_PASSWORD,
  database: 'app',
  pool: { max: 20 },
});
```

| Option | Environment variable | |
|---|---|---|
| `dialect` | `DB_DIALECT` | `postgres`, `mysql`, `sqlite` or `mssql` |
| `url` | `DATABASE_URL` | Connection URL |
| `host`, `port` | `DB_HOST`, `DB_PORT` | |
| `user`, `password` | `DB_USER`, `DB_PASSWORD` | |
| `database` | `DB_NAME` | Database name; for SQLite, the file path |
| `pool.min`, `pool.max` | `DB_POOL_MIN`, `DB_POOL_MAX` | Pool size. `max` defaults to 10 |
| `ssl` | | `true` or driver TLS options (Postgres, MySQL). SQL Server encrypts unless `false` |
| `trustServerCertificate` | | SQL Server: accept a self-signed certificate |
| `naming` | | `"preserve"` (default) or `"snake_case"`. See [Column names](/advanced/orm/models#column-names) |

Settings passed to `useMeghORM()` override the environment. To build them
in an `@AppConfig` class ([example](/advanced/database#using-a-config-class)), pass the class:

```ts
@AppConfig
class DatabaseConfig extends MeghConfig<DatabaseOptions> {
  config(env: Environment): DatabaseOptions {
    return { url: env.get('DATABASE_URL'), pool: { max: Number(env.get('POOL')) || 10 } };
  }
}

app.useMeghORM(DatabaseConfig);
```

If the database can't be reached, `app.run()` fails with the reason and where
it tried to connect (without the password). A missing driver is reported with
the `npm install` command to run.

Outside an app, in scripts and tests, connect with
`Model.useConnection(createDatabase(resolveDatabaseOptions({ url })))`.

::: details Upgrading from `useDatabase(kysely)`
`app.useDatabase(db)` still works, with a deprecation warning, for apps that
create their own Kysely instance. Replace it with `useMeghORM()` and delete
`src/database/connection.ts`: the migration commands now connect from
`DATABASE_URL` too.
:::

## Guides

| Page | What it covers |
|---|---|
| [Models](/advanced/orm/models) | Decorators, keys, column names, timestamps, soft deletes, casts |
| [Queries](/advanced/orm/queries) | Where clauses, aggregates, scopes, pagination, writes, transactions |
| [Relations](/advanced/orm/relations) | hasMany, hasOne, belongsTo, belongsToMany, eager loading |
| [Query Builder](/advanced/orm/query-builder) | `DB.table()` queries and raw SQL |
| [Migrations](/advanced/orm/migrations) | The schema builder and the migration runner |
| [Seeding and Factories](/advanced/orm/seeding) | Seeders, model factories and Faker |

To use TypeORM or Knex instead, see [TypeORM and Knex](/advanced/database).

## Testing

The ORM is tested against SQLite. The MySQL path for reading back inserted
rows, which has no `RETURNING`, is implemented but not yet covered by tests.
