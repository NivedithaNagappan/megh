---
title: Upgrading to 0.5.5
description: "What changes in Megh 0.5.1 to 0.5.5: Megh's own validation decorators, exception filters, health checks and request IDs, one pipeline order, scaffolding from templates, auth and RBAC, seeders and factories, typed OpenAPI responses, SQL Server fixes, useMeghORM and Megh's own DI container."
---

# Upgrading to 0.5.5

0.5.1 to 0.5.4 need no code changes: apps written for 0.5.0 keep working.
0.5.1 brings Megh's own ORM setup and DI container, and deprecates
`app.useDatabase()`. 0.5.2 is a bug-fix release. 0.5.3 adds seeders,
factories and documented responses, and fixes the ORM on SQL Server. 0.5.4
adds scaffolding to the CLI and documents `@Query()` parameters.

0.5.5 adds Megh's own validation decorators, exception filters, health
checks and request IDs, and fixes a batch of runtime bugs. Most apps need no
code changes, but read [Breaking in 0.5.5](#breaking-in-0-5-5) first: the
middleware order changed, and some routes now send the status they declare.

```sh
npm i @meghjs/core@^0.5.5
npm i -D @meghjs/cli@^0.5.5
```

## Breaking in 0.5.5

- **`@UseMiddleware` runs before authentication.** The pipeline is now
  middleware → authentication → `@Authorized` → validation → handler, for
  global, controller and route middleware alike. Before, `@UseMiddleware`
  ran after `@Authorized` and could read `request.user`. Move logic that
  needs the user into the authorization handler or the route, or read the
  user in a later middleware of your own. See
  [Pipeline order](/core-concept/middleware#pipeline-order).
- **`app.run()` listens on `0.0.0.0` by default** instead of localhost, so
  the app is reachable inside containers. Keep local-only with
  `app.run(port, { host: '127.0.0.1' })` or `HOST=127.0.0.1`.
- **Status codes are honoured.** `@HttpCode`, `Results.Created`,
  `Results.NoContent`, `Results.NotFound` and `HttpResponse.Created` now send
  their status instead of 200. Clients that checked for 200 on these routes
  need updating.
- **Unknown routes** answer `{ code: 404, status: "Error", message }`
  instead of Fastify's default 404 body.
- **`MeghTest`** uses the production error handler, so tests see redacted
  5xx responses (`Internal Server Error`) unless `NODE_ENV=development`.

## New in 0.5.5

- [Validation decorators](/core-concept/validation) in `@meghjs/core`:
  `IsString`, `MinLength`, `ValidateNested`, `Type`, `Transform` and more,
  with class-validator's names, options and messages. Each DTO is compiled
  once, so validating a request is several times faster. Switching a DTO is a
  change of import; class-validator DTOs keep working. Also `validateDto()`.
- `experimental.compiledValidation` (or `MEGH_COMPILED_VALIDATION=1`)
  speeds up class-validator DTOs with the same results.
- `validator` is an optional peer dependency, needed only for `@IsUUID`,
  `@IsUrl` and `@IsEmail` with options.
- [Error handling](/core-concept/error-handling): exception filters,
  `@Catch`, `@UseFilters`, `app.useErrorHandler()`, `app.useErrorLogger()`
  and more HTTP exception classes.
- Inline routes get `mapPatch`, the authentication handler, and
  `.authorized()`, and they send `Results` with their status.
- `app.run(port, { host, onListen, shutdownTimeout })`.
- `MEGH_DOTENV=false` skips loading `.env` on import.
- [Health checks](/advanced/health): `app.useHealth()` serves `/health` and
  `/ready`; Megh ORM registers a `database` check.
- [Request IDs](/advanced/logging#request-ids): an `x-request-id` on every
  response, `reqId` on every log line, and `getRequestId()`.

## Fixes in 0.5.5

- `useScheduler({ path })` no longer crashes `run()`.
- `@UploadFile` and `@UploadFiles` receive the saved files.
- `@All()` registers every method instead of crashing.
- Framework errors keep their status (400 bad JSON, 413, 415, 429).
- A failing socket listener is logged instead of crashing the process.
- Two controllers with the same class name no longer share route metadata.
- Shutdown closes the cache, exits with code 1 on failure, and gives up
  after `shutdownTimeout`.
- `.env` is parsed once instead of on every `Environment.get()`.
- Inline route middleware classes are called with `this` bound.

## New in 0.5.4

- **Tables and models from templates.** `npx megh make:model Product --template ecommerce/product`
  (or `make:resource`) writes the create-table migration and the model (or
  the whole REST resource). Tables its foreign keys point to are created
  too. `--fields "title,price:money,status:in(draft|live)"` describes a
  table on the command line, with presets such as `slug`, `price` and
  `address`. See [Templates and Fields](/cli/scaffold/templates).
- **Business domains.** `npx megh scaffold:domain ecommerce` (`sc:domain`)
  scaffolds a domain's tables at once. There are 11 domains: common,
  e-commerce, POS, medical, construction, marketing, real estate, HR, CRM,
  education and logistics. Add your own in `.megh/templates/`. See
  [Domains](/cli/scaffold/domains).
- **Auth.** `npx megh scaffold:auth` (`sc:auth`) adds sign-up and sign-in
  with JWTs, API keys or both, and optionally roles and permissions: the
  tables, password hashing, `AppAuthentication`, `AppAuthorization`, an
  `AuthController` and a roles seeder, registered in `src/app.ts`. See
  [Auth](/cli/scaffold/auth).
- **RBAC.** `npx megh scaffold:rbac` (`sc:rbac`) adds roles (one or many per
  user) and permissions, checked with `@Authorized({ roles })` and
  `@Authorized({ permissions })`. See [RBAC](/cli/scaffold/rbac).
- **`megh template:list`** (`templates`) lists the templates.
- **SQL Server-safe foreign keys.** On SQL Server, scaffolded migrations
  avoid the "may cause cycles or multiple cascade paths" error and write
  `restrict` as `NO ACTION`. See [SQL Server](/cli/scaffold/templates#sql-server).

## Fixes in 0.5.4

- **`@Query()` parameters are documented.** A `@Query()` DTO and
  `@Query('key')` parameters were missing from the OpenAPI document. Each DTO
  property and each key is now a query parameter, with its type and
  constraints. See [Query parameters](/microservices/openapi#query-parameters).

## New in 0.5.3

- **Seeders.** `npx megh make:seeder users` writes a seeder, and
  `npx megh db:seed` (or `megh migrate --seed`) runs them in one transaction,
  so a failing seeder saves nothing. See
  [Seeding and Factories](/advanced/orm/seeding).
- **Factories with Faker.** `defineFactory(User, ({ faker }) => ({ … }))`
  builds rows with fake values, and `npx megh make:factory user` writes one
  from the model's columns. Install Faker to use them:
  `npm i -D @faker-js/faker`. See [Factories](/advanced/orm/seeding#factories).
- **`megh update:model`.** After an alter-table migration, it brings a model's
  column fields up to date and keeps relations and methods. See
  [Updating a model](/cli/generators#updating-a-model).
- **Relation fields typed with the model.** Write
  `@BelongsTo(() => Role) role?: Role | null` and `posts?: Post[]` instead of
  `BelongsTo<Role>` and `HasMany<Post>`, which still work. See
  [Relations](/advanced/orm/relations).
- **Documented responses.** `@ApiResponse(200, User)` documents a response
  with a model or DTO, `Paginated(User)` a page, and Megh adds the `400`,
  `401` and `403` a route can return. `make:resource` writes them. See
  [Responses](/microservices/openapi#responses).
- **Typed OpenAPI options.** `OpenApiUiOptions` types every option, including
  Swagger UI's settings, and `auth: 'bearer'` marks `@Authorized` routes. See
  [Securing routes](/microservices/openapi#securing-routes).

## Fixes in 0.5.3

- **Creating rows works on SQL Server.** `create()`, `save()` and
  `insertGetId()` saved the row, then failed with `Validation failed for
  parameter '1'. Invalid number.` They now return the row with
  `OUTPUT inserted.*`.
- **SQL Server shows the real error.** A failing migration or transaction
  could report `The ROLLBACK TRANSACTION request has no corresponding BEGIN
  TRANSACTION` instead of what went wrong, for example a foreign key to a
  table that doesn't exist.
- **`dropColumn()` works on SQL Server** for columns with a default.
- **Optional relation fields are relations.** A field such as
  `role?: BelongsTo<Role>` was treated as a column, so `create()` accepted it
  and `with('role')` didn't type-check.
- **The route decorators' `openapi` option is read.**
  `@Get('/', { openapi: { … } })` was ignored.

## Changes to note in 0.5.3

- `make:model` writes the column type on nullable columns
  (`@Column({ nullable: true, type: "string" })`), so OpenAPI can document
  them. Running `update:model` adds it to fields it generated before.
- Migrations' `table.string("name", 20)` is read as `varchar(20)`, so
  `make:resource` DTOs now get `@MaxLength(20)`.
- `OpenApiResponse()` is deprecated: it documents a `{ code, status, data }`
  wrapper that Megh doesn't send. Use `@ApiResponse()`.
- Code that passed a relation to `create()` or `fill()` through an optional
  marker field now fails to compile, as it should.

## Fixes in 0.5.2

- **`@UseMiddleware(SomeClass)` works.** Passing a middleware class to
  `@UseMiddleware` on a controller or route crashed `app.run()` with
  `Function is not registered`. Classes are now resolved through the DI
  container, so they can use constructor injection. The
  `@UseMiddleware(new SomeClass())` workaround still works. See
  [Middleware](/core-concept/middleware#controller-scoped).
- **Paging works on SQL Server.** `limit()`, `offset()`, `first()`, `find()`,
  `exists()`, `paginate()`, `simplePaginate()` and `forPage()` failed with
  `Incorrect syntax near 'limit'`. Queries now use `top(n)` and
  `offset … fetch next … rows only` on SQL Server. See
  [Paging on SQL Server](/advanced/orm/queries#paging-on-sql-server).

## Changes in 0.5.1

### Connect with `useMeghORM()`

Megh now creates the database connection itself. Kysely ships with
`@meghjs/core`, so an app only installs the driver for its database.

```ts [src/app.ts]
// Before (0.5.0)
import { db } from "./database/connection";
app.useDatabase(db);

// After (0.5.1+)
app.useMeghORM(); // reads DATABASE_URL, or pass { dialect, host, ... }
```

1. Put the connection in `.env`, for example
   `DATABASE_URL=postgres://app:secret@localhost:5432/app`.
   [Connecting](/advanced/orm#connecting) lists every option and variable.
2. Replace `app.useDatabase(db)` with `app.useMeghORM()`.
3. Delete `src/database/connection.ts`, and a `"database"` path under `"megh"`
   in `package.json` if you set one. While that file exists, `megh migrate`
   keeps using it; once it's gone, migrations connect from `DATABASE_URL` too.
4. Uninstall `kysely` unless your own code imports it.

`app.useDatabase(db)` still works in 0.5.x and logs a deprecation warning.

### Models with decorators

Models can describe their table with decorators. Models written with
`static table` and `hasMany(() => Post)` keep working, so move them over
when it suits you.

```ts
@Table("users")
export class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column({ unique: true }) email!: string;
  @Column({ name: "display_name" }) displayName!: string;
  @CreatedAt() createdAt?: Date;

  @HasMany(() => Post) posts!: HasMany<Post>;
}
```

- Fields marked `?` are optional in `create()`.
- `@Column({ name })`, or `useMeghORM({ naming: 'snake_case' })`, maps
  camelCase properties to other column names. See
  [Column names](/advanced/orm/models#column-names).
- `npx megh make:model` now writes decorator models.

### Migrations with the schema builder

`npx megh make:migration` now writes migrations with Megh's schema builder,
which picks the right SQL type for each database:

```ts
export default defineMigration({
  async up(schema) {
    await schema.create("users", (table) => {
      table.id();
      table.string("email").unique();
      table.timestamps();
    });
  },
  async down(schema) {
    await schema.dropIfExists("users");
  },
});
```

Existing Kysely migrations (`export async function up(db)`) still run, in
order with the new ones.

### The `DB` query builder

For queries that don't need a model:

```ts
import { DB } from "@meghjs/core";

const ids = await DB.table("users").where("active", true).pluck("id");
await DB.transaction(async () => {
  /* ... */
});
```

See [Query builder](/advanced/orm/query-builder).

### Megh's own DI container

`typedi` is no longer a dependency. `MeghContainer`, `@Injectable()`, `Token`
and `inject()` keep their API, and `inject()` now also works in field
initializers:

```ts
@Injectable()
class UserService {
  private readonly users = inject(UserRepository);
  private readonly mailer = inject(Mailer, { optional: true });
}
```

If your app imported `typedi` directly, switch to `MeghContainer` or add
`typedi` to your own dependencies. Missing services and dependency cycles now
fail with the full constructor chain in the error. See
[Dependency Injection](/core-concept/dependency-injection).

### `megh new`

New projects can include the ORM: pick **MeghORM** from the features, or pass
`--database postgres|mysql|sqlite|mssql`.
