---
title: MeghORM
description: "Megh's built-in, type-safe models on top of Kysely: queries, relations, timestamps, soft deletes, casts and migrations."
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

Everything the ORM does is on this page. You don't need another library's
docs.

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
is also where the [migration commands](#migrations) read them:

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

  @HasMany(() => Post) posts!: HasMany<Post>;

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
| `@HasMany`, `@HasOne`, `@BelongsTo`, `@BelongsToMany` | [Relations](#relations) |

Column options:

| Option | |
|---|---|
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

::: details Models without decorators
Models written before decorators keep working: every field is a column except
relations (declared with `hasMany()` and the others), methods and getters, and
settings are static fields (`static readonly table = 'users'`, `primaryKey`,
`generated`, `timestamps`, `softDeletes`, `casts`). Decorators set the same
settings, so the two styles can be mixed while you migrate.
:::

## Querying

```ts
await User.all();
await User.find(1);              // User | undefined
await User.findOrFail(1);        // throws a 404 NotFoundException if missing
await User.findBy('email', 'ann@acme.io');       // first match, or undefined
await User.findBy({ email: 'ann@acme.io', active: true });
await User.findByOrFail('email', 'ann@acme.io'); // or a 404

await User.where('email', 'ann@acme.io').first();
await User.where('id', '>', 10).orderBy('name', 'desc').limit(10).offset(20).get();
await User.where('name', null).get();          // IS NULL
await User.query().whereIn('id', [1, 2, 3]).get();
await User.query().whereNotNull('name').count();
await User.where('email', 'ann@acme.io').exists();
```

`User.where()`, `User.with()`, `User.whereHas()`, `User.withCount()` and
`User.scope()` start a query; `User.query()` starts an empty one. Nothing runs
until `get()`, `first()`, `firstOrFail()`, `count()`, `exists()`, an aggregate,
a paginate method, `update()` or `delete()` is called.

Pass a callback for anything else Kysely can express, such as `OR` groups:

```ts
await User.where((eb) => eb.or([eb('role', '=', 'admin'), eb('id', '=', 1)])).get();
```

`select()` fetches only some columns, and the result type narrows to them:

```ts
const rows = await User.query().select('id', 'email').get();
rows[0].email; // string
rows[0].name;  // compile error
```

### Aggregates

```ts
await Post.count();
await Post.sum('views');                         // 0 when no rows match
await Post.where('user_id', 1).avg('views');     // null when no rows match
await Post.min('published_on');                  // casts apply: a Date here
await Post.max('views');
```

Aggregates respect filters and soft deletes, like every other query.

### Scopes

A scope is a reusable piece of a query, typed for its model:

```ts
import type { Scope } from '@meghjs/core';

const published: Scope<Post> = (q) => q.whereNotNull('published_on');
const byAuthor: Scope<Post, [number]> = (q, userId) => q.where('user_id', userId);

await Post.scope(published).scope(byAuthor, 1).orderBy('id').get();
```

### Pagination

`paginate()` returns the same `{ data, meta }` shape as the rest of Megh:

```ts
const page = await Post.query().orderBy('id').paginate({ page: 2, perPage: 20 });
// page.meta → { total, page, perPage, lastPage, next, prev }
await Post.paginate({ page: 1 }); // every row
```

`simplePaginate()` skips the `count(*)` query, which is costly on large
tables. It fetches one extra row to tell whether another page follows:

```ts
const page = await Post.query().simplePaginate({ page: 2, perPage: 20 });
// page.meta → { page, perPage, hasMore, next, prev }
```

`cursorPaginate()` pages by key instead of by offset. Pages stay stable when
rows are inserted, and deep pages are as fast as the first. Pass the returned
`nextCursor` back to get the next page:

```ts
const first = await Post.where('published', true).cursorPaginate({ perPage: 20 });
const next = await Post.where('published', true).cursorPaginate({
  perPage: 20,
  cursor: first.meta.nextCursor, // null on the last page
});
// meta → { perPage, hasMore, nextCursor }
```

It orders by the primary key by default; pass `column` (it must be unique)
and `direction: 'desc'` to change that. An invalid cursor throws a 400
`BadRequestException`.

## Creating, updating and deleting

```ts
// insert and return the stored row (generated columns included)
const user = await User.create({ email: 'ann@acme.io' }); // id generated, name nullable → optional

// or build an instance and save it
const bob = new User().fill({ email: 'bob@acme.io', name: 'Bob' });
await bob.save();

// save() updates only the columns that changed, and does nothing if none did
bob.name = 'Robert';
await bob.save(); // UPDATE users SET name = ? WHERE id = ?

await bob.delete();

// many rows at once; both return the number of rows affected
await Post.where('user_id', 1).update({ published: true });
await Post.where('published', false).delete();
```

`create()`'s argument is typed from the model: required columns must be
present, and generated, nullable and timestamp columns may be left out.

## Relations

```ts
@Table()
class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;

  @HasMany(() => Post) posts!: HasMany<Post>;         // posts.user_id → users.id
  @HasOne(() => Profile) profile!: HasOne<Profile>;   // profiles.user_id → users.id
}

@Table()
class Post extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() user_id!: number;

  @BelongsTo(() => User, { foreignKey: 'user_id' }) author!: BelongsTo<User>;
}
```

Each relation decorator has a field type of the same name. The type is what
lets `with('posts')` load `Post[]` and type-check. The related class is
passed as a function, so models can refer to each other in any order. Key
defaults:

| Relation | Foreign key default | Options |
|---|---|---|
| `@HasMany(() => Post)` | `<owner class>_id` on the related table, e.g. `user_id` | `foreignKey`, `localKey` |
| `@HasOne(() => Profile)` | same as `HasMany` | `foreignKey`, `localKey` |
| `@BelongsTo(() => User)` | `<field name>_id` on this table, e.g. `author_id` | `foreignKey`, `ownerKey` |

### Eager loading

Load relations with `with()`. Use dots for nested relations:

```ts
const users = await User.with('posts.comments', 'profile').get();

users[0].posts;          // Post[]
users[0].profile;        // Profile | null
users[0].posts[0].author; // compile error: not loaded
```

Each relation level is one query, however many rows there are:

```sql
select * from users
select * from posts where user_id in (?, ?)
select * from comments where post_id in (?, ?, ?)
select * from profiles where user_id in (?, ?)
```

### Querying by relation

`whereHas()` keeps rows that have a related row; `whereDoesntHave()` keeps
those that don't. Narrow the related rows with a callback, and follow nested
relations with dots:

```ts
await User.whereHas('posts').get();
await User.whereHas('posts', (q) => q.where('published', true)).get();
await User.whereHas('posts.comments', (q) => q.where('body', 'like', '%megh%')).get();
await User.whereDoesntHave('roles').delete();
```

Each one runs as an `EXISTS` subquery, so it works with `count()`,
`paginate()`, `update()` and `delete()` too. Soft-deleted related rows don't
count.

### Counting related rows

`withCount()` adds a `<relation>_count` number to each result, without loading
the rows:

```ts
const users = await User.withCount('posts', 'roles').get();
users[0].posts_count; // number

await User.query().withCount('posts', (q) => q.where('published', true)).get();
```

Counts appear in JSON but are never written back by `save()`.

### Creating related rows

`related()` on a `hasMany` or `hasOne` relation creates rows with the foreign
key already set:

```ts
const post = await user.related('posts').create({ title: 'Hello' }); // user_id set
await user.related('posts').createMany([{ title: 'A' }, { title: 'B' }]);
await user.related('posts').save(existingPost);  // moves it to this user
await user.related('posts').query().where('published', true).get();
const profile = await user.related('profile').get(); // Profile | null
```

### Many-to-many

```ts
@Table()
class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;

  @BelongsToMany(() => Role, { pivotColumns: ['granted_by'] })
  roles!: BelongsToMany<Role, { granted_by: string | null }>;
}
```

The pivot table defaults to both snake_case class names, sorted and joined:
`role_user`, with the columns `user_id` and `role_id`. Override any of these
with options:

```ts
@BelongsToMany(() => Role, {
  table: 'user_roles',
  foreignPivotKey: 'member_id',
  relatedPivotKey: 'role_id',
})
roles!: BelongsToMany<Role>;
```

Loaded models carry their pivot row in `pivot`, which also appears in JSON:

```ts
const user = await User.with('roles').firstOrFail();
user.roles[0].pivot.granted_by; // string | null
```

Change the links through `related()`:

```ts
await user.related('roles').attach([adminRole, 3], { granted_by: 'root' }); // models or keys
await user.related('roles').detach(adminRole);  // or detach() for all
await user.related('roles').sync([1, 2]);       // → { attached, detached }, in one transaction
const roles = await user.related('roles').get();
```

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

## Transactions

```ts
await Model.transaction(async () => {
  const user = await User.create({ email: 'ann@acme.io' });
  await Profile.create({ user_id: user.id, bio: '' });
});
```

Every model query inside the callback uses the transaction, even in functions
it calls. The transaction commits when the callback resolves and rolls back if
it throws.

A nested `Model.transaction()` runs in a savepoint. If it throws, only its own
work is rolled back, and the error still reaches the caller:

```ts
await Model.transaction(async () => {
  await Order.create({ total: 10 });
  try {
    await Model.transaction(async () => {
      await Invoice.create({ order_id: 1 });
      throw new Error('mailer down');
    });
  } catch {
    // the invoice is gone, the order is kept
  }
});
```

If the outer transaction rolls back, so does everything nested inside it.

## Raw queries

`Model.db()` returns the Kysely instance (the transaction, inside
`Model.transaction()`). Type it from your models with `DatabaseOf`:

```ts
import { Model, type DatabaseOf } from '@meghjs/core';

type DB = DatabaseOf<typeof User | typeof Post>;

const rows = await Model.db<DB>()
  .selectFrom('posts')
  .innerJoin('users', 'users.id', 'posts.user_id')
  .select(['posts.title', 'users.email'])
  .execute(); // { title: string; email: string }[]
```

The connection is also registered in the container under `ORM_CONNECTION`:

```ts
import { MeghContainer, ORM_CONNECTION } from '@meghjs/core';

const db = MeghContainer.get(ORM_CONNECTION); // Kysely<any>
```

## Migrations

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

### Tables

| | |
|---|---|
| `schema.create(name, (table) => …)` | Create a table |
| `schema.table(name, (table) => …)` | Change a table |
| `schema.drop(name)` / `schema.dropIfExists(name)` | Drop a table |
| `schema.rename(from, to)` | Rename a table |
| `schema.hasTable(name)` / `schema.hasColumn(table, column)` | Check what exists |
| `schema.raw(sql)` | Run SQL as written, for anything else |

### Columns

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

### Indexes and keys

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

### Changing tables

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

### Running migrations from code

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

## Generating models

`npx megh make:model user` writes `src/models/user.model.ts`, with its
columns read from the migrations that create and change the `users` table.
See [CLI: Model](/cli/basic#model).

## Testing

The ORM is tested against SQLite. The MySQL path for reading back inserted
rows, which has no `RETURNING`, is implemented but not yet covered by tests.
