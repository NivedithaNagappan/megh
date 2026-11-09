---
title: Scaffold
description: Generate tables, models and whole features from templates with the Megh CLI.
---

# Scaffold

The `scaffold:*` commands, and the `--template` / `--fields` options of
`make:model` and `make:resource`, build complete parts of an app from
templates. A template describes a table: its columns, foreign keys,
timestamps and indexes. It becomes an ordinary `schema.create(...)`
[migration](/advanced/orm/migrations), and the usual [generators](/cli/generators)
then write the model, DTOs, service, controller and factory from that
migration. Everything generated is plain code you own and can edit.

| Command | Alias | Description |
|---------|-------|-------------|
| `make:model <name> --template <ref>` | `m:m` | A table and its model from a template |
| `make:resource <name> --template <ref>` | `m:r` | A table and its full REST resource from a template |
| `make:model <name> --fields <list>` | `m:m` | A table described on the command line |
| `scaffold:domain [domain]` | `sc:domain` | Several tables of a business domain at once |
| `scaffold:auth` | `sc:auth` | Sign-up and sign-in with JWTs and/or API keys, optionally with roles |
| `scaffold:rbac` | `sc:rbac` | Roles (one or many per user) and permissions |
| `template:list [domain]` | `templates` | List the templates |

## Pages

| Page | What it covers |
|---|---|
| [Templates and Fields](/cli/scaffold/templates) | `--template`, `--fields`, the field spec and presets, your own templates |
| [Domains](/cli/scaffold/domains) | `scaffold:domain` and every built-in template |
| [Auth](/cli/scaffold/auth) | `scaffold:auth`: JWT, API keys, the generated routes and code |
| [RBAC](/cli/scaffold/rbac) | `scaffold:rbac`: roles, permissions and `@Authorized({ roles })` |

## Quick Start

```sh
npx megh new shop --yes --database postgres
cd shop

# Sign-in with JWTs, many roles per user, roles grant permissions
npx megh sc:auth --strategy jwt --roles multiple --permissions -y

# The store: products, orders, payments, ...
npx megh sc:domain ecommerce --resource -y

npx megh migrate --seed
npm run start:dev
```

## How It Works

1. **Migrations.** Each template becomes a create-table migration in
   `src/database/migrations/`. Tables a foreign key points to are created too
   when no migration creates them yet (`products.category_id` brings in
   `categories`). Migrations are numbered so each table comes after the tables
   it references, and after every migration already in the folder.
2. **Models and more.** The migrations are read, not run, so no database is
   needed: `make:model`, `make:resource` and `make:factory` build the model,
   DTOs, service, controller and factory from their columns.
3. **Existing work is kept.** A table some migration already creates keeps
   that migration, and the template's columns are not applied to it. An
   existing model is reused. To change a table, write an alter-table
   migration and run [`update:model`](/cli/generators#updating-a-model).

Then create the tables:

```sh
npx megh migrate
```

## Prompts

In a terminal, commands ask for what is missing: a template, the templates
of a domain, the sign-in strategy, the role mode, and whether to create the
tables foreign keys point to. Pass `-y` / `--yes` to skip the prompts and use
the options given (and the defaults), e.g. in scripts and CI.
