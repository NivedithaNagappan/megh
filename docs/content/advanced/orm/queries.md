---
title: Queries
description: "Reading and writing rows with MeghORM models: where clauses, aggregates, scopes, pagination, writes and transactions."
---

# Queries

Models read and write rows through typed queries. Column names and values are checked against the model, and results are model instances.

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

### Paging on SQL Server

SQL Server has no `LIMIT`, so on SQL Server `limit()` becomes `select top(n)`
and `offset()` becomes `offset … rows fetch next … rows only`. SQL Server only
allows an offset after an `ORDER BY`, so a query with an offset but no
`orderBy()` gets `order by (select null)`, and its row order is not
guaranteed. Add an `orderBy()` when paging so pages stay stable.

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
