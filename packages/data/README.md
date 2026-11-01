# @meghjs/data

TypeORM and Knex integration for [Megh](https://meghjs.github.io).

`@meghjs/data` is a Megh [plugin](https://meghjs.github.io/advanced/plugins).
Once it is installed, the app gains `app.useTypeORM()` and `app.useKnex()`; nothing
needs to be imported to enable them.

```bash
npm install @meghjs/data typeorm pg   # TypeORM
npm install @meghjs/data knex pg      # Knex
```

Projects created with `megh new` load the plugin's types through the generated
`megh-env.d.ts`. In other projects, add the file yourself and include it in
`tsconfig.json`:

```typescript
// megh-env.d.ts
/// <reference types="@meghjs/data" />
```

Both methods connect before they resolve, register the connection with the
container, and close it when the app shuts down (`app.close()`, SIGTERM or SIGINT).
For a bundled app, which has no `package.json` to discover plugins from, pass the
plugin explicitly:

```typescript
import { Megh } from "@meghjs/core";
import { dataPlugin } from "@meghjs/data";

const app = Megh.createApplication({ plugins: [dataPlugin] });
```

## Knex

`useKnex` connects eagerly and verifies the connection, so it returns a promise:

```typescript
await app.useKnex({
  client: "mysql",
  connection: {
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "password",
    database: "myapp",
  },
});
```

Using a config class:

```typescript
import { AppConfig, MeghConfig, Environment } from "@meghjs/core";
import type { Knex } from "knex";

@AppConfig
export class KnexConfig extends MeghConfig<Knex.Config> {
  config(env: Environment): Knex.Config {
    return {
      client: "mysql",
      connection: {
        host: env.get("DB_HOST") || "127.0.0.1",
        port: Number(env.get("DB_PORT")) || 3306,
        user: env.get("DB_USER") || "root",
        password: env.get("DB_PASS") || "password",
        database: env.get("DB_NAME") || "myapp",
      },
    };
  }
}

await app.useKnex(KnexConfig);
```

Using in a service:

```typescript
import { AppService } from "@meghjs/core";
import { KnexDB } from "@meghjs/data";

@AppService
export class UsersService {
  constructor(private readonly db: KnexDB) {}

  async findAll() {
    return this.db.client.select("*").from("users");
  }

  async page(page: number) {
    return this.db.paginate(this.db.client("users").orderBy("id"), {
      page,
      perPage: 20,
    });
  }
}
```

---

## TypeORM

`useTypeORM` initializes the DataSource, so it returns a promise:

```typescript
await app.useTypeORM({
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "postgres",
  password: "password",
  database: "megh",
  entities: [User],
  synchronize: true,
});
```

Using a config class:

```typescript
import { AppConfig, MeghConfig, Environment } from "@meghjs/core";
import type { DataSourceOptions } from "typeorm";

@AppConfig
export class DataSourceConfig extends MeghConfig<DataSourceOptions> {
  config(env: Environment): DataSourceOptions {
    return {
      type: "postgres",
      host: env.get("DB_HOST") || "localhost",
      port: Number(env.get("DB_PORT")) || 5432,
      username: env.get("DB_USER") || "postgres",
      password: env.get("DB_PASS") || "password",
      database: env.get("DB_NAME") || "megh",
      entities: [User],
      synchronize: true,
    };
  }
}

await app.useTypeORM(DataSourceConfig);
```

**Injecting a repository.** `@InjectRepository` gives you the TypeORM repository
plus a `paginate()` method:

```typescript
import { AppService } from "@meghjs/core";
import { InjectRepository, PaginatedRepository } from "@meghjs/data";
import { User } from "./user.entity";

@AppService
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: PaginatedRepository<User>,
  ) {}

  findAll() {
    return this.userRepo.find();
  }

  page(page: number) {
    return this.userRepo.paginate({ page, perPage: 20 });
  }
}
```

**Custom repositories.** Extend `MeghRepository` for pagination, transactions
and your own query methods. Query operators (`Like`, `In`, `Not`, `Between`,
`IsNull`, `Equal`, `ArrayContains`, …) are exported from `@meghjs/data`.

In 0.3.0, give the class an explicit constructor that calls `super()`, even if
it has no dependencies (see [Known Issues](#known-issues-in-030)):

```typescript
import { MeghRepository, Repository, Like } from "@meghjs/data";

@Repository(User)
export class UserRepository extends MeghRepository<User> {
  constructor(private readonly audit: AuditService) {
    super();
  }

  search(term: string, page = 1) {
    return this.paginate(
      { where: { name: Like(`%${term}%`) } },
      { page, perPage: 20 },
    );
  }

  async rename(id: number, name: string) {
    return this.transaction(async (tx) => {
      await tx.update({ id }, { name });
      await this.audit.log("rename", id);
    });
  }
}
```

`transaction()` joins an already active transaction instead of opening a nested
one. `withManager(manager)` returns a copy of the repository bound to another
`EntityManager`.

## Pagination

`repo.paginate()`, `MeghRepository.paginate()`, `KnexDB.paginate()` and
`paginateKnex()` return core's unified `{ data, meta }` shape; see
[Pagination](https://github.com/meghjs/megh/tree/main/packages/core#pagination).

## License

MIT
