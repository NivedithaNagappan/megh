---
title: CLI
description: "The megh command: create, run and build apps, generate code and manage the database."
---

# CLI

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
| `make:model` | `m:m` | Create a MeghORM model (columns from its migrations), or a TypeORM entity with `--orm` |
| `update:model` | `u:m` | Sync an existing model's columns with its migrations |
| `make:resource` | `m:r` | Create a REST resource for a model: DTOs, CRUD service and controller |
| `make:controller` | `m:c` | Create a controller |
| `make:service` | `m:s` | Create a service |
| `make:config` | `m:cnf` | Create a config class |
| `make:middleware` | `m:mlwr` | Create a middleware |
| `make:migration` | `m:mig` | Create a database migration |
| `make:seeder` | `m:sd` | Create a database seeder |
| `make:factory` | `m:f` | Create a model factory with Faker values |
| `migrate` | | Run pending migrations (`--seed` to seed afterwards) |
| `migrate:status` | | Show which migrations have run |
| `migrate:rollback` | | Undo the last migration (`--step <n>` for more) |
| `migrate:reset` | | Undo every migration |
| `migrate:refresh` | | Undo every migration, then run them all again (`--seed` too) |
| `db:seed` | | Run the seeders (`--seeder <name>` for one) |
| `scaffold:domain` | `sc:domain` | Create the tables and models (or resources) of a business domain |
| `scaffold:auth` | `sc:auth` | Add sign-up and sign-in with JWTs and/or API keys, optionally with roles |
| `scaffold:rbac` | `sc:rbac` | Add roles and permissions to an app's users |
| `template:list` | `templates` | List the model templates |

Every `make:*` command takes `-f` / `--force` to overwrite an existing file.
`make:model` and `make:resource` also build the table from a
[template](/cli/scaffold/templates) with `--template` or `--fields`.

## Pages

| Page | Commands |
|---|---|
| [Generators](/cli/generators) | `make:resource`, `make:controller`, `make:service`, `make:model`, `update:model`, `make:middleware`, `make:config` |
| [Database Commands](/cli/database) | `make:migration`, `migrate*`, `make:seeder`, `db:seed`, `make:factory` |
| [Scaffold](/cli/scaffold/) | `--template`, `--fields`, `scaffold:domain`, `scaffold:auth`, `scaffold:rbac`, `template:list` |

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

## Build

```sh
npx megh build
```

Removes `dist/` and compiles the project with `tsconfig.build.json`.
