---
title: Megh Commands
description: Useful commands
---

# Megh Commands

Install the CLI globally, or run it with `npx`:

```sh
npm i -g @meghjs/cli
```

## Command Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `new` | | Create a new application |
| `serve` | | Start the dev server with watch + rebuild |
| `build` | | Compile using `tsconfig.build.json` |
| `make:model` | `m:m` | Create an ORM model (columns from its migrations) or TypeORM entity |
| `update:model` | `u:m` | Sync an existing model's columns with its migrations |
| `make:resource` | `m:r` | Create a REST resource for a model: DTOs, CRUD service and controller |
| `make:controller` | `m:c` | Create a controller |
| `make:service` | `m:s` | Create a service |
| `make:config` | `m:cnf` | Create a config class |
| `make:middleware` | `m:mlwr` | Create a middleware |
| `make:migration` | `m:mig` | Create a database migration |
| `make:seeder` | `m:sd` | Create a database seeder |
| `migrate` | | Run pending migrations (`--seed` to seed afterwards) |
| `migrate:status` | | Show which migrations have run |
| `migrate:rollback` | | Undo the last migration (`--step <n>` for more) |
| `migrate:reset` | | Undo every migration |
| `migrate:refresh` | | Undo every migration, then run them all again (`--seed` too) |
| `db:seed` | | Run the seeders (`--seeder <name>` for one) |

Every `make:*` command takes `-f` / `--force` to overwrite an existing file.

## Application

```sh
npx @meghjs/cli new myapi
```

You are prompted for a package manager and optional features: OpenAPI docs,
CORS, MeghORM, TypeORM, Knex and Scalar UI. With MeghORM you also pick the
database. Non-interactively:

```sh
npx @meghjs/cli new myapi --yes --database postgres   # also: mysql, sqlite, mssql
```

`--database` (or the `orm` feature, which defaults to SQLite) installs the
driver, adds `app.useMeghORM()` to `src/app.ts`, writes `DATABASE_URL` to
`.env` and creates `src/database/migrations/`. Then:

```sh
cd myapi
npm run start:dev
```

## Development Server

```sh
npx megh serve
```

Compiles `src/` with SWC into `dist/`, starts the app and restarts it on change.
The entry point comes from `megh.entry` in `package.json`, falling back to `main`.

## Resource

```sh
npx megh make:resource user
# shorthand
npx megh m:r user
```

Generates a complete REST resource for a [Megh ORM](/advanced/orm) model:

| File | Contents |
|------|----------|
| `src/models/user.model.ts` | Reused if it exists; otherwise built from the migration that creates `users` (as `make:model` does) |
| `src/dtos/user.dto.ts` | `CreateUserDto`, `UpdateUserDto` (every field optional) and `ListUsersQuery` (`page`, `perPage`) |
| `src/services/user.service.ts` | `findAll`, `paginate`, `find`, `findOrFail`, `create`, `update`, `delete` |
| `src/controllers/user.controller.ts` | `GET /users`, `GET /users/:id`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id` |

The DTO validators come from the model's fields and the migration's column
types: `varchar(255)` gets `@MaxLength(255)`, an `email` column `@IsEmail()`,
nullable columns and columns with a default are optional, and the generated
primary key and timestamps are left out. A missing row gives a 404.

If there is neither a model nor a migration for the table, nothing is
written; create the migration first (`megh make:migration create_users_table`).
Use `--table <name>` when the table name isn't the plural snake_case name, and
`-f` to overwrite existing DTO, service and controller files. Nested names
work too: `megh m:r admin/user` serves `/admin/users`.

If the model is a TypeORM entity, the service uses its repository and no DTOs
are generated.

Register the controller in your app:

```ts
app.useControllers([UserController]);
```

## Controller

```sh
npx megh make:controller user
# shorthand
npx megh m:c user
```

Pass `-r` for a full REST skeleton, and `-m <model>` to bind it to a model:

```sh
npx megh m:c user -m user -r
```

With `-m`, the controller is generated like [`make:resource`](#resource): the model's
DTOs, service and model (from its migration) are created if missing, and the
controller delegates to the service. Add `--orm` to back that service with a
TypeORM repository instead.

Use `-rt <dir>` to place the file under a different directory, and `--base-path`
to emit `@ApiController` without a route prefix.

## Service

```sh
npx megh make:service user
```

A resource service uses the [Megh ORM](/advanced/orm) model (generated from its
migration if it doesn't exist yet):

```sh
npx megh make:service user -m user -r
```

Add `--orm` for one backed by a TypeORM repository:

```sh
npx megh make:service user -m user -r --orm
```

## Model

```sh
# Megh ORM model
npx megh make:model user
npx megh make:model user --table app_users   # table name other than "users"

# TypeORM entity
npx megh m:m user --orm
```

`make:model` writes a [Megh ORM](/advanced/orm) model. It looks for the
model's table (by default the plural snake_case name: `User` → `users`,
`BlogPost` → `blog_posts`) in your migrations. If one creates it, the model
gets a decorated field for every column, with its type, nullability and
value conversion. The primary key, auto-increment, timestamp and soft-delete
columns get their own decorators. Later migrations that add, drop or rename
columns are taken into account:

```ts
// Columns read from the migrations (the table is created in 20260101000000_create_users_table.ts).
@Table("users")
export class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() email!: string;
  @Column({ nullable: true }) name!: string | null;
  @Column({ type: "boolean" }) is_admin?: boolean;
  @CreatedAt() created_at?: Date;
  @UpdatedAt() updated_at?: Date;
}
```

Columns the database fills in (auto-increment, defaults, timestamps) are
declared with `?`, so `create()` can leave them out. If no migration creates
the table, you get a model with an `id` and commented examples to fill in. The migrations are read, not run, so no database is needed.
Relations aren't generated; add them yourself.

### Updating a model

After a migration alters the table, bring the model up to date without
regenerating it:

```sh
npx megh update:model user
npx megh u:m user --dry-run   # show the changes, write nothing
npx megh u:m user --dto       # also rewrite src/dtos/user.dto.ts
```

For a migration such as:

```ts
await schema.table("users", (table) => {
  table.string("phone", 20).nullable();
  table.dropColumn("age");
});
```

`update:model` adds `@Column({ nullable: true }) phone!: string | null;` after the
model's existing columns, removes the `age` field (with its doc comment), and
rewrites any field still in the shape `make:model` writes when its type or
nullability changed. Only column fields are touched: relations, methods,
getters and comments stay as they are. A field you customized (a `name:`
mapping, a custom cast, extra options) is kept as written and reported so you
can check it. A renamed column shows up as one field removed and one added.

The model must be a decorated (`@Table`) model; for an older model with
`static table` and `static casts`, regenerate it with `make:model --force`.
Without `--dto`, a DTO from `make:resource` is not changed, and the command
reminds you it may be out of date.

## Middleware

```sh
npx megh make:middleware auth
```

Generates a class extending `MeghMiddleware`:

```ts [src/middlewares/auth.middleware.ts]
import { AppMiddleware, MeghMiddleware, IRequest, IResponse } from '@meghjs/core';

@AppMiddleware
export class AuthMiddleware extends MeghMiddleware {
  async invoke(req: IRequest, res?: IResponse) {
    // your logic goes here
    return req;
  }
}
```

## Config

```sh
npx megh make:config jwt
```

Generates a class extending `MeghConfig` and registered with `@AppConfig`:

```ts [src/config/jwt.config.ts]
import { AppConfig, MeghConfig, Environment } from '@meghjs/core';

@AppConfig
export class JwtConfig extends MeghConfig {
  config(env: Environment) {
    return {};
  }
}
```

## Migrations

```sh
npx megh make:migration create_users_table
npx megh migrate
```

`make:migration` writes `src/database/migrations/<timestamp>_<name>.ts`.
A `create_<table>_table` name gives a create-table migration, and
`add_<x>_to_<table>_table` an alter-table one; `--create <table>` and
`--table <table>` choose explicitly.

The `migrate` commands connect the way `app.useMeghORM()` does, from
`DATABASE_URL` (or the `DB_*` variables) in the environment or `.env`. Set
`megh.migrations` in `package.json` to use another folder. See
[MeghORM: Migrations](/advanced/orm#migrations).

## Seeders

```sh
npx megh make:seeder roles
npx megh make:seeder users
npx megh make:seeder database   # the entry seeder: calls roles, then users
npx megh db:seed
```

`make:seeder` writes `src/database/seeders/<name>.seeder.ts`
(`UserSeeder` and `user_seeder` both become `user.seeder.ts`):

```ts [src/database/seeders/roles.seeder.ts]
import { defineSeeder } from '@meghjs/core';
import { Role } from '../../models/role.model';

export default defineSeeder({
  async run() {
    await Role.create({ name: 'Admin' });
    await Role.create({ name: 'Editor' });
  },
});
```

`db:seed` runs the `database` seeder, which calls the others in the order you
choose; `make:seeder database` fills that in from the seeders that already
exist. Without a `database` seeder, every seeder runs in file-name order.

```sh
npx megh db:seed --seeder users       # just one (also -s)
npx megh migrate --seed               # migrate, then seed
npx megh migrate:refresh --seed       # rebuild the schema and seed it
```

A whole run is one transaction: if a seeder throws, nothing is saved and the
error names the seeder. Seeding refuses to run when `NODE_ENV` is
`production` unless you pass `--force`. Set `megh.seeders` in `package.json`
to use another folder. See [MeghORM: Seeding](/advanced/orm#seeding).

## Build

```sh
npx megh build
```

Removes `dist/` and compiles the project with `tsconfig.build.json`.
