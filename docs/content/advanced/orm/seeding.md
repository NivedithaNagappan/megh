---
title: Seeding and Factories
description: Filling the database with seeders, and building fake rows with model factories and Faker.
---

# Seeding and Factories

Seeders put rows in the database; factories make rows with fake values. A seeder often uses factories, and tests use factories on their own.

## Seeding

Seeders fill the database with rows for development, tests and demos. Each
file in `src/database/seeders/` exports `defineSeeder({ run })`, and is named
after its file without `.seeder.ts`:

```ts [src/database/seeders/users.seeder.ts]
import { DB, defineSeeder } from '@meghjs/core';
import { Role } from '../../models/role.model';
import { User } from '../../models/user.model';

export default defineSeeder({
  async run() {
    const admin = await Role.findByOrFail('name', 'Admin');
    await User.create({ name: 'Ann', email: 'ann@example.com', role_id: admin.id! });
    await DB.table('settings').insert([{ key: 'theme', value: 'dark' }]);
  },
});
```

The `database` seeder is the entry point. `call()` runs other seeders by
name, in order:

```ts [src/database/seeders/database.seeder.ts]
export default defineSeeder({
  async run({ call }) {
    await call('roles', 'users');
  },
});
```

Run them with `npx megh db:seed` (see [CLI: Seeders](/cli/database#seeders)).
Without a `database` seeder, every seeder runs in file-name order. A run is
one transaction, which models, `DB.table()` and the `db` passed to `run()`
all use, so a failing seeder saves nothing. A seeder that calls itself,
directly or through others, is reported as a loop.

### Seeding from code

`Seeders` runs them from code, for example in test setup:

```ts
import { Model, Seeders } from '@meghjs/core';

const seeders = new Seeders(Model.db(), { folder: `${__dirname}/database/seeders` });
await seeders.run();         // the database seeder, else all; returns the names that ran
await seeders.run('roles');  // one seeder
```

Pass `seeders: { roles: defineSeeder({ run }) }` instead of `folder` to define
them inline, and `transaction: false` to commit each statement as it runs. A
failure throws a `SeedError` whose `seeder` names the seeder that failed.

## Factories

A factory builds rows of a model with fake values from
[Faker](https://fakerjs.dev), for seeders and tests. Install Faker in the app
(`npm install -D @faker-js/faker`), then define the factory, or generate one
with [`megh make:factory user`](/cli/database#factories):

```ts [src/database/factories/user.factory.ts]
import { defineFactory } from '@meghjs/core';
import { User } from '../../models/user.model';
import { RoleFactory } from './role.factory';

export const UserFactory = defineFactory(User, ({ faker, sequence }) => ({
  name: faker.person.fullName(),
  email: `user${sequence}@${faker.internet.domainName()}`,
  is_active: true,
  role_id: RoleFactory,
}));
```

The definition gets `faker` and `sequence` (1 for the first row this factory
builds, then 2, 3, …). Its values are typed from the model, like `create()`'s.

```ts
await UserFactory.create();                        // one saved row
await UserFactory.createMany(10);                  // ten, each with its own values
await UserFactory.create({ name: 'Ann' });         // override some values
const user = await UserFactory.make();             // an unsaved instance; user.save() inserts it
const body = await UserFactory.raw();              // just the values, e.g. for a POST in a test
```

`state()` returns a new factory with more values applied. Keep the ones you
reuse as constants:

```ts
export const InactiveUser = UserFactory.state({ is_active: false });
export const Admin = UserFactory.state(({ sequence }) => ({ name: `Admin ${sequence}` }));

await InactiveUser.createMany(3);
```

A value that is another factory creates a related row and uses its primary
key: `role_id: RoleFactory` gives each user its own role. To share one, pass
the key: `UserFactory.createMany(5, { role_id: admin.id })`.

Inside a seeder, factories run in its transaction like every other query, so
a failing seed saves nothing:

```ts [src/database/seeders/users.seeder.ts]
export default defineSeeder({
  async run() {
    const admin = await RoleFactory.create({ name: 'Admin' });
    await UserFactory.createMany(20, { role_id: admin.id });
  },
});
```

`useFaker()` changes the Faker instance factories use, for a locale or for
repeatable values:

```ts
import { fakerDE } from '@faker-js/faker';
import { useFaker } from '@meghjs/core';

useFaker(fakerDE);
fakerDE.seed(42); // the same values on every run
```
