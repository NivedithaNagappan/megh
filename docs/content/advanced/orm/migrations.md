---
title: Migrations
description: Creating and changing tables with MeghORM migrations and the schema builder.
---

# Migrations

A migration is a file in `src/database/migrations` whose default export is
`defineMigration({ up, down })`. Both functions receive the schema builder.
`down` undoes `up`, so the migration can be rolled back. Migrations run in
file-name order, so names start with a timestamp.

Create one with the CLI:

```sh
npx megh make:migration create_users_table
```

```ts [src/database/migrations/20261101093000_create_users_table.ts]
import { defineMigration } from '@meghjs/core';

export default defineMigration({
  async up(schema) {
    await schema.create('users', (table) => {
      table.id();
      table.string('email').unique();
      table.string('name').nullable();
      table.boolean('active').default(true);
      table.foreignId('team_id').constrained().cascadeOnDelete();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop('users');
  },
});
```

The same migration runs on PostgreSQL, MySQL, SQLite and SQL Server. Each
column type becomes the right SQL type for the database, and statements are
issued the way each one needs them.

The name picks the template:

- `create_<table>_table` gives a create-table migration.
- `add_<x>_to_<table>_table` (also `remove`/`drop`/`alter`/`change`/`update`,
  with `to`/`from`/`in`/`on`) gives an alter-table one.
- Anything else gives an empty migration.

`--create <table>` and `--table <table>` choose the template explicitly.

## Tables

| | |
|---|---|
| `schema.create(name, (table) => …)` | Create a table |
| `schema.table(name, (table) => …)` | Change a table |
| `schema.drop(name)` / `schema.dropIfExists(name)` | Drop a table |
| `schema.rename(from, to)` | Rename a table |
| `schema.hasTable(name)` / `schema.hasColumn(table, column)` | Check what exists |
| `schema.raw(sql)` | Run SQL as written, for anything else |

## Columns

Columns are `NOT NULL` unless marked `nullable()`.

| Method | PostgreSQL | MySQL | SQLite | SQL Server |
|---|---|---|---|---|
| `id(name = 'id')`, `increments(name)` | `integer` identity | `int auto_increment` | `integer autoincrement` | `int identity` |
| `bigIncrements(name)` | `bigint` identity | `bigint auto_increment` | `integer autoincrement` | `bigint identity` |
| `string(name, length = 255)` | `varchar` | `varchar` | `varchar` | `nvarchar` |
| `text(name)` | `text` | `text` | `text` | `nvarchar(max)` |
| `integer(name)` | `integer` | `int` | `integer` | `int` |
| `bigInteger(name)` | `bigint` | `bigint` | `integer` | `bigint` |
| `float(name)` | `real` | `float` | `real` | `real` |
| `double(name)` | `double precision` | `double` | `real` | `float` |
| `decimal(name, precision = 8, scale = 2)` | `numeric` | `decimal` | `numeric` | `decimal` |
| `boolean(name)` | `boolean` | `boolean` | `integer` | `bit` |
| `date(name)` | `date` | `date` | `date` | `date` |
| `datetime(name)` | `timestamp` | `datetime` | `datetime` | `datetime2` |
| `timestamp(name)` | `timestamptz` | `datetime` | `datetime` | `datetimeoffset` |
| `time(name)` | `time` | `time` | `time` | `time` |
| `json(name)` | `jsonb` | `json` | `text` | `nvarchar(max)` |
| `uuid(name)` | `uuid` | `char(36)` | `varchar(36)` | `uniqueidentifier` |
| `binary(name)` | `bytea` | `blob` | `blob` | `varbinary(max)` |
| `foreignId(name)` | `integer` | `int` | `integer` | `int` |
| `timestamps()` | nullable `created_at` and `updated_at`, for `@CreatedAt` / `@UpdatedAt` | | | |
| `softDeletes(name = 'deleted_at')` | nullable timestamp, for `@DeletedAt` | | | |

`id()` is a 32-bit integer, so drivers return it as a number. `bigIncrements()`
holds more rows, but PostgreSQL and MySQL drivers return 64-bit integers as
strings.

Modifiers, chained after a column:

| | |
|---|---|
| `.nullable()` | Allow `NULL` |
| `.unique()` | Unique index |
| `.primary()` | Primary key |
| `.default(value)` | Default value. Booleans, dates and objects are converted for the database |
| `.useCurrent()` | Default to the current time |
| `.autoIncrement()` | Numbered by the database |
| `.constrained(table?, column = 'id')` | Foreign key. The table comes from the column name: `team_id` → `teams` |
| `.references('teams.id')` | Foreign key to a given table and column |
| `.onDelete(action)`, `.onUpdate(action)` | `'cascade'`, `'set null'`, `'restrict'`, `'no action'`, `'set default'` |
| `.cascadeOnDelete()`, `.nullOnDelete()` | Shorthands. `nullOnDelete()` also makes the column nullable |

## Indexes and keys

```ts
await schema.create('posts', (table) => {
  table.id();
  table.integer('author_id');
  table.string('slug');
  table.unique(['author_id', 'slug']);    // posts_author_id_slug_unique
  table.index('slug');                    // posts_slug_index
  table.foreign('author_id').references('users.id').cascadeOnDelete();
});
```

Indexes and keys are named `<table>_<columns>_<index|unique|foreign>`, so you
can drop them by their columns: `table.dropIndex(['slug'])`,
`table.dropUnique([...])`, `table.dropForeign(['author_id'])`.
`table.primary(['a', 'b'])` declares a primary key over several columns.

## Changing tables

```ts
await schema.table('users', (table) => {
  table.string('phone').nullable();
  table.foreignId('company_id').nullable().constrained();
  table.renameColumn('name', 'full_name');
  table.dropColumn('legacy');
});
```

A column added to an existing table must be `nullable()` or have a
`default()`, because rows already in the table need a value.

SQLite can't add a foreign key or primary key to an existing column, or drop
one. Declare them in `schema.create()`, or add the foreign key together with
its new column (`foreignId(...).constrained()`), which SQLite supports. Doing
otherwise throws a `SchemaError` that explains this.

::: details Migrations written against Kysely
Migration files that export `up(db)` / `down(db)` functions taking the Kysely
instance still run, in order with the others. New migrations use the schema
builder.
:::

Then run them:

| Command | |
|---|---|
| `megh migrate` | Run pending migrations |
| `megh migrate:status` | Show which have run (`--json` for JSON) |
| `megh migrate:rollback` | Undo the last migration; `--step <n>` for more |
| `megh migrate:reset` | Undo every migration |
| `megh migrate:refresh` | Undo every migration, then run them all again |

The commands compile `src/` with SWC, load `.env`, and connect the way
`app.useMeghORM()` does: from `DATABASE_URL` or the `DB_*` variables. Settings
that aren't secret can go in `package.json`, as can a different migrations
folder:

```json [package.json]
{
  "megh": {
    "database": { "dialect": "postgres", "pool": { "max": 2 } },
    "migrations": "migrations"
  }
}
```

A project that still has `src/database/connection.ts` exporting a Kysely
instance keeps using it, as does `"database": "path/to/module.ts"`.

A failing migration stops the run, and the error names it. What happens to
the migrations before it depends on the database:

- **PostgreSQL and SQL Server** support transactional DDL, so the whole run is
  one transaction: a failure rolls back every migration in that run.
- **MySQL and SQLite** don't, so migrations that ran before the failure stay
  applied. The error lists them.

Executed migrations are recorded in Kysely's `kysely_migration` table, so
projects already using Kysely migrations keep their history.

## Running migrations from code

`Migrations` runs the same operations from code, for example in test setup or
at deploy time:

```ts
import { Migrations, Model } from '@meghjs/core';

// After app.useMeghORM() (or Model.useConnection()):
const migrations = new Migrations(Model.db(), { folder: `${__dirname}/database/migrations` });
await migrations.latest();     // names that ran
await migrations.rollback(2);
await migrations.status();     // [{ name, executedAt }]
```

Pass `migrations: { name: defineMigration({ up, down }) }` instead of `folder` to define them
inline, and `table` / `lockTable` to change the bookkeeping table names. A
failed run throws a `MigrationError` with `migration` (the one that failed) and
`completed` (those that ran before it; on PostgreSQL and SQL Server they were
rolled back with it).
