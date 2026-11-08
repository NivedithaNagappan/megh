---
title: Models
description: "Defining MeghORM models with decorators: columns, keys, column names, timestamps, soft deletes and casts."
---

# Models

A model is a class that describes one table. Its decorators give the columns, keys and value conversions, and TypeScript checks every query against them.

## Defining models

Extend `Model` and describe the table with decorators:

```ts [src/models/user.model.ts]
import {
  Model, Table, PrimaryKey, AutoIncrement, Column,
  CreatedAt, UpdatedAt, HasMany,
} from '@meghjs/core';
import { Post } from './post.model';

@Table('users')
export class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column({ unique: true }) email!: string;
  @Column({ nullable: true }) name!: string | null;
  @Column() active!: boolean;
  @CreatedAt() created_at?: Date;
  @UpdatedAt() updated_at?: Date;

  @HasMany(() => Post) posts?: Post[];

  get displayName() {
    return this.name ?? this.email;
  }

  greet() {
    return `Hi ${this.displayName}`;
  }
}
```

Query results are instances of the model, so methods and getters work on them.

**Optional fields.** Declare columns the database fills in with `?`: the
auto-increment `id`, timestamps, columns with a default. They're optional in
`create()`, and present on every row you load, so `user.id` is a `number` on
query results.

**Fields that aren't columns.** Only decorated fields are saved. For
TypeScript to leave a field out of `where()` and `create()` too, make it
`private`, `readonly` or a getter.

### Decorators

| Decorator | |
|---|---|
| `@Table(name?)` | The table. Without a name, the plural snake_case class name: `BlogPost` → `blog_posts` |
| `@Column(options?)` | A column. Also `@Column('text')` or `@Column('text', options)` |
| `@PrimaryKey(options?)` | The primary key. Defaults to `id` when no field has it |
| `@AutoIncrement()` | A column the database numbers: `SERIAL`/`IDENTITY` on PostgreSQL, `AUTO_INCREMENT` on MySQL, `IDENTITY(1,1)` on SQL Server, `AUTOINCREMENT` on SQLite. Left out of inserts |
| `@Identity()` | Same as `@AutoIncrement()` |
| `@CreatedAt()` | Set when the row is inserted. See [Timestamps](#timestamps) |
| `@UpdatedAt()` | Set on every insert and update |
| `@DeletedAt()` | Turns on [soft deletes](#soft-deletes) |
| `@HasMany`, `@HasOne`, `@BelongsTo`, `@BelongsToMany` | [Relations](/advanced/orm/relations) |

Column options:

| Option | |
|---|---|
| `name` | The column's name, when it differs from the property. See [Column names](#column-names) |
| `type` | `string`, `text`, `integer`, `bigint`, `float`, `double`, `decimal`, `boolean`, `date`, `datetime`, `timestamp`, `time`, `json`, `uuid`, `binary`. `boolean` and `Date` fields are detected from the TypeScript type |
| `nullable` | Allows `NULL` |
| `unique` | |
| `default` | Default value |
| `length` | For `string` |
| `precision`, `scale` | For `decimal` |
| `cast` | How stored values convert. Defaults from `type`; see [Casts](#casts) |

Decorated columns are inherited, so shared columns can live in a base class:

```ts
export abstract class BaseModel extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @CreatedAt() created_at?: Date;
  @UpdatedAt() updated_at?: Date;
}

@Table()
export class Tag extends BaseModel {
  @Column() name!: string;
}
```

### Column names

By default a property is stored in the column with the same name. To use
camelCase properties with snake_case columns, set the naming strategy once:

```ts
app.useMeghORM({ naming: 'snake_case' });

@Table()
class Post extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() authorId!: number;        // author_id
  @Column() publishedAt!: Date | null; // published_at
  @CreatedAt() createdAt?: Date;      // created_at
}
```

Or name a column explicitly, which works with either strategy:

```ts
@Table('legacy_customers')
class Customer extends Model {
  @PrimaryKey({ name: 'customer_no' }) @AutoIncrement() id?: number;
  @Column({ name: 'e_mail' }) email!: string;
  @CreatedAt({ name: 'created_on' }) createdAt?: Date;
}
```

Model code then uses property names everywhere: `create()`, `where()`,
`orderBy()`, `select()`, `withCount()`, `cursorPaginate({ column })`,
aggregates, query results and JSON. Relation keys may be given as either the
property or the column, so the defaults (`author_id`) work with an `authorId`
property.

Code that writes SQL itself uses column names: the [query builder](/advanced/orm/query-builder),
[raw queries](/advanced/orm/query-builder#raw-queries), `where((eb) => …)` expressions and migrations.
In scripts and tests without an app, call `setNamingStrategy('snake_case')`
before querying.

::: details Models without decorators
Models written before decorators keep working: every field is a column except
relations (declared with `hasMany()` and the others), methods and getters, and
settings are static fields (`static readonly table = 'users'`, `primaryKey`,
`generated`, `timestamps`, `softDeletes`, `casts`). Decorators set the same
settings, so the two styles can be mixed while you migrate.
:::

## Timestamps

```ts
@Table()
class Post extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() title!: string;
  @CreatedAt() created_at?: Date;
  @UpdatedAt() updated_at?: Date;
}
```

The `@CreatedAt` column is set on insert, and the `@UpdatedAt` column on every
insert and update: `create()`, `save()`, query `update()`, and soft deletes and
restores. Both are read back as `Date`. Use either one on its own, and name
the fields after your columns.

## Soft deletes

```ts
@Table()
class Post extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @DeletedAt() deleted_at?: Date | null;
}
```

With a `@DeletedAt` column, `delete()` sets it instead of removing the row,
and every query, eager load included, leaves those rows out:

```ts
await post.delete();
post.isTrashed();                              // true
await Post.find(post.id);                      // undefined
await Post.withTrashed().find(post.id);        // still there
await Post.onlyTrashed().get();                // only deleted rows

await post.restore();
await Post.onlyTrashed().where('user_id', 1).restore();

await post.forceDelete();                      // really delete
await Post.onlyTrashed().forceDelete();
```

## Casts

Casts convert between what the database stores and what the model holds. A
column's `type` picks its cast (`boolean`, `json`, `date`, `datetime` and
`timestamp` have one), and `cast` sets it explicitly:

```ts
@Table()
class Member extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() is_admin!: boolean;                                  // boolean, from the TypeScript type
  @Column({ type: 'json', nullable: true }) settings!: { theme: string } | null;
  @Column({ type: 'date', nullable: true }) born_on!: Date | null;
  @Column({ type: 'decimal', cast: 'number' }) balance!: number;
}
```

`boolean` and `Date` fields get their cast from the TypeScript type. A
nullable field (`boolean | null`) has no single type at runtime, so give it
`type`.

| Cast | Read as | Written as |
|---|---|---|
| `'boolean'` | `true` / `false` (from `1`/`0`, `'true'`, …) | the boolean (`1`/`0` on SQLite) |
| `'number'` | a number, e.g. from Postgres `numeric` / `bigint` strings | the number |
| `'string'` | a string | the value |
| `'json'` | the parsed value | JSON text |
| `'date'` | a `Date` | `YYYY-MM-DD`, from the date's UTC parts |
| `'datetime'` | a `Date` | the `Date` (ISO text on SQLite) |
| `{ get, set }` | `get(stored)` | `set(value)` |

```ts
const csv: CustomCast<string[], string> = {
  get: (stored) => (stored === '' ? [] : stored.split(',')),
  set: (tags) => tags.join(','),
};
```

Timestamp and soft-delete columns are cast as `'datetime'` automatically.
`save()` notices changes made in place, such as `member.settings.theme = 'dark'`.

SQLite drivers can only bind numbers, strings and buffers, so on SQLite
`Date` values become ISO text and booleans become `1`/`0`, in `where()` too.

## Generating models

`npx megh make:model user` writes `src/models/user.model.ts`, with its
columns read from the migrations that create and change the `users` table.
See [CLI: Model](/cli/generators#model).
