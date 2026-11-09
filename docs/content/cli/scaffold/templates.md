---
title: Templates and Fields
description: Create tables and models from templates and field specs with make:model --template and --fields.
---

# Templates and Fields

## From a Template

```sh
npx megh make:model Product --template ecommerce/product
npx megh make:resource Product --template ecommerce/product   # + DTOs, service, controller
npx megh m:m Product --template                              # pick a domain, then a template
```

A template is named `<domain>/<name>`. A bare name works when only one
domain has it, and a `common` template wins (`--template category` is
`common/category`). See every template on the [Domains](/cli/scaffold/domains)
page, or list them:

```sh
npx megh template:list              # domains and templates
npx megh templates ecommerce        # one domain, with each template's columns
npx megh templates --json
```

For `make:model Product --template ecommerce/product`:

```ts [src/database/migrations/20261110093000_create_products_table.ts]
import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("products", (table) => {
      table.id();
      table.foreignId("category_id").constrained("categories").nullOnDelete();
      table.foreignId("brand_id").constrained("brands").nullOnDelete();
      table.string("name");
      table.string("slug").unique();
      table.string("sku", 64).unique();
      table.text("description").nullable();
      table.decimal("price", 12, 2);
      table.decimal("compare_at_price", 12, 2).nullable();
      table.decimal("cost", 12, 2).nullable();
      table.integer("stock").default(0);
      table.decimal("weight", 10, 3).nullable();
      table.string("status", 32).default("draft"); // draft | active | archived
      table.boolean("is_featured").default(false);
      table.timestamps();
      table.softDeletes();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("products");
  },
});
```

Since no migration creates `categories` or `brands`, their migrations
(`common/category`, `ecommerce/brand`) and models are written first. You are
asked before they are added; `--no-deps` leaves them out (create those
tables yourself before migrating).

The model's name sets the table: `make:model Item --template ecommerce/product`
creates `items` with the product columns. Pass `--table <name>` to choose it.

### Options

| Option | Description |
|---|---|
| `--template [ref]` | The template; without a value, pick one |
| `--fields <list>` | Columns to add to the template, or to replace its columns of the same name |
| `--table <name>` | Table name (default: from the model name) |
| `--factory` | Also write a [factory](/advanced/orm/seeding) for each model |
| `--no-deps` | Don't create the tables foreign keys point to |
| `-f`, `--force` | Overwrite the model (or the resource's files) if they exist |
| `-y`, `--yes` | Don't prompt |

## From Fields

Describe the table on the command line, with or without a template:

```sh
npx megh make:resource Ticket --fields "title,body,priority,status:in(open|pending|closed),user_id:cascade"
npx megh make:model Product --template ecommerce/product --fields "barcode?:string(64):unique,weight:decimal(8,2)"
```

Every table gets an `id` and timestamps. Foreign keys to tables no migration
creates are handled as with templates (`user_id` above brings in `users`).

## Field Spec

A field is written `name[?][:type[(args)]][:modifier]...`, and a list is
separated by commas:

| Spec | Column |
|---|---|
| `title` | The `title` preset: `string(255)` |
| `slug` | The `slug` preset: `string(255)`, unique |
| `email:unique` | The `email` preset, unique |
| `phone?` | The `phone` preset, nullable (`?`) |
| `address?` | The `address` group: six columns, all nullable |
| `nickname?:string(50)` | `string(50)`, nullable |
| `price:money` | `decimal(12,2)` |
| `hours:decimal(5,1):default(0)` | `decimal(5,1)` with a default |
| `status:in(draft\|published)` | `string(32)` that defaults to `draft`, the allowed values in a comment |
| `kind:in(a\|b)` | `string(32)`, required |
| `category_id` | A foreign key to `categories`, from the name |
| `owner_id:foreign(users):cascade` | A foreign key to `users`, deleted with the user |

Field names are snake_case. `key`, `save`, `fill`, `delete`, `restore` and
`related` can't be used: they are `Model` methods.

### Types

| Type | Column |
|---|---|
| `string(n)` | `VARCHAR(n)`, 255 by default |
| `text` | Long text |
| `integer` / `int`, `bigInteger` / `bigint` | Integers |
| `decimal(p,s)` | Exact number, `(8,2)` by default |
| `money` | `decimal(12,2)` |
| `percent` | `decimal(5,2)` |
| `float`, `double` | Floating point |
| `boolean` / `bool` | Boolean |
| `date`, `datetime`, `timestamp`, `time` | Dates and times |
| `json` | JSON (`JSONB` on PostgreSQL) |
| `uuid` | UUID |
| `email` | `string(255)` |
| `phone` | `string(32)` |
| `url` | `string(2048)` |
| `foreign(table)` / `foreignId` | Integer foreign key with its constraint |

### Modifiers

| Modifier | Effect |
|---|---|
| `nullable` (or `?` after the name) | Allow NULL |
| `unique` | Unique index |
| `index` | Index |
| `default(value)` | Default value: a number, `true` / `false`, or text |
| `in(a\|b\|c)` | Allowed values. `status` defaults to the first one unless `default()` is given |
| `cascade` | Foreign key: delete the row with the referenced row |
| `nullOnDelete` | Foreign key: set it to NULL (makes it nullable) |
| `restrict` | Foreign key: refuse to delete the referenced row |

### SQL Server

SQL Server refuses a foreign key whose `ON DELETE` action (`CASCADE` or
`SET NULL`) would form a cycle, including a table that references itself,
or a second cascade path between two tables. When the project's database is
SQL Server (from `megh.database`, `DB_DIALECT` or the `DATABASE_URL` scheme),
the generated migrations account for the foreign keys already in your
migrations: `CASCADE` is kept first, and a foreign key that would break the
rule gets no `ON DELETE` action, with a comment in the migration and a line
in the output:

```ts
table.foreignId("parent_id").nullable().constrained("categories"); // no ON DELETE action: SQL Server allows one cascade path between tables
```

Deleting the referenced row then fails while rows point to it; clear or
reassign them first. `restrict` is written as `onDelete("no action")`, since
SQL Server has no `RESTRICT`. Other databases get the actions as given.

Allowed values are written as a comment next to the column; the
generated DTO doesn't check them. Add `@IsIn([...])` to the DTO to
validate them.

### Presets

A bare name that isn't a type picks a preset, the columns shared across
models. Add modifiers to change one (`email:unique`, `price?`).

| Group | Presets |
|---|---|
| Names and text | `name`, `title`, `slug` (unique), `code` (unique), `sku` (unique), `reference` (unique), `description`, `notes`, `body`, `summary`, `first_name`, `last_name`, `middle_name`, `username` (unique) |
| Contact | `email`, `phone`, `mobile`, `website`, `url`, `image`, `avatar`, `logo` |
| Auth | `password`, `remember_token`, `email_verified_at`, `last_login_at` |
| State | `status` (default `active`, indexed), `type` (indexed), `priority` (`low` … `urgent`), `is_active` (default true), `is_featured`, `sort_order`, `color`, `rating` |
| Money and quantities | `price`, `cost`, `amount`, `subtotal`, `discount`, `tax`, `total`, `balance` (all `money`), `tax_rate`, `currency` (default `USD`), `quantity`, `stock`, `weight` |
| People | `gender`, `date_of_birth`, `national_id` |
| Dates | `date`, `due_date`, `starts_at`, `ends_at`, `published_at`, `paid_at` |
| Other | `uuid`, `ip_address`, `metadata`, `settings` (json) |
| Column groups | `address` (`address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`), `geo` (`latitude`, `longitude`), `person` (`first_name`, `last_name`) |

Optional-sounding presets (`description`, `phone`, `image`, dates such as
`due_date`, …) are nullable. A name ending in `_id` without a type is a
foreign key.

## Your Own Templates

Put templates in `.megh/templates/<domain>.json`, one file per domain:

```json [.megh/templates/helpdesk.json]
{
  "title": "Helpdesk",
  "description": "Support tickets",
  "templates": [
    {
      "name": "ticket",
      "description": "A support request",
      "fields": ["user_id:cascade", "title", "body", "priority", "status:in(open|pending|closed)"],
      "softDeletes": true
    },
    {
      "name": "ticket_tag",
      "fields": ["ticket_id:cascade", "tag_id:cascade"],
      "pivot": true
    }
  ]
}
```

```sh
npx megh make:resource Ticket --template helpdesk/ticket
npx megh sc:domain helpdesk
```

| Key | Description |
|---|---|
| `domain` | Domain name (default: the file name) |
| `title`, `description` | Shown by `template:list` and the prompts |
| `templates[].name` | snake_case singular name |
| `templates[].fields` | Field specs, as for `--fields` |
| `templates[].table` | Table name (default: the plural name) |
| `templates[].timestamps` | `created_at` / `updated_at` (default `true`; `false` for a join table) |
| `templates[].softDeletes` | `deleted_at` (default `false`) |
| `templates[].pivot` | A join table: no `id`, the first two foreign keys are the primary key, and no model is generated |
| `templates[].unique` | Composite unique keys, e.g. `[["customer_id", "product_id"]]` |

A file named after a built-in domain adds templates to it, and a template
with the same name as a built-in one replaces it.
