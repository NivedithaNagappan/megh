# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.6.0](https://github.com/meghjs/megh/compare/v0.5.5...v0.6.0) (2026-11-12)

* feat(core)!: default run() to the PORT environment variable ([3261312](https://github.com/meghjs/megh/commit/3261312d2670baa079ee106973af73c98dbd8a07)), closes [#102](https://github.com/meghjs/megh/issues/102)
* feat(core)!: remove no-op and unused public APIs ([646187a](https://github.com/meghjs/megh/commit/646187a4f381bd090e042562b8101d7f254ea453)), closes [#86](https://github.com/meghjs/megh/issues/86) [#87](https://github.com/meghjs/megh/issues/87) [#88](https://github.com/meghjs/megh/issues/88) [#89](https://github.com/meghjs/megh/issues/89) [#90](https://github.com/meghjs/megh/issues/90) [#91](https://github.com/meghjs/megh/issues/91) [#92](https://github.com/meghjs/megh/issues/92) [#93](https://github.com/meghjs/megh/issues/93)

### Bug Fixes

* **cli:** keep NODE_ENV out of the scaffolded .env ([3294d86](https://github.com/meghjs/megh/commit/3294d86c7e50a93f241de7e9e5354243fb4f61c4)), closes [#103](https://github.com/meghjs/megh/issues/103)

### BREAKING CHANGES

* apps that call app.run() without a port and have PORT
  set to something other than 4000 now listen on PORT. Pass the port
  explicitly to keep the old behaviour.
* useHttps(), useSerialization(), mapFeatures(),
  MeghSocketIo, DuplicateRouteException, MeghRouter.mapRoute(),
  MeghRouter.registerMiddleware(), CreateSwaggerObjectSchema and
  GetObjectSchema are removed. They did nothing or duplicated another
  API. Use generateClassSchema in place of the schema aliases. The
  startup line is now a pino log entry instead of console.log.


## [0.5.5](https://github.com/meghjs/megh/compare/v0.5.4...v0.5.5) (2026-11-12)

* feat(core)!: one pipeline order, and complete inline routes ([e4aa8fa](https://github.com/meghjs/megh/commit/e4aa8fa0f664869232392a61b1498ba97444b285))

### Bug Fixes

* **core:** respect the declared type when casting path and query values ([dcebb02](https://github.com/meghjs/megh/commit/dcebb02ec626ff6d870f2400e00f159410bf23b1))
* **core:** runtime bugs from the 1.0 checklist ([255cc5d](https://github.com/meghjs/megh/commit/255cc5d688eeaa858c26b17e75946578ac296a75))

### Features

* **core:** compiled DTO validation and Megh's own validation decorators ([7415c00](https://github.com/meghjs/megh/commit/7415c00710bf6a631053140b7111a1b957db023a))
* **core:** health endpoints and request IDs ([fe01391](https://github.com/meghjs/megh/commit/fe01391d7e501560c65598df07ff685cbb2276a2))
* **core:** pluggable error handling with exception filters ([2e0c317](https://github.com/meghjs/megh/commit/2e0c317c071cd882236062ad09bd6dcad453a862))

### BREAKING CHANGES

* @UseMiddleware runs before authentication and
  @Authorized, so it can no longer read request.user.



## [0.5.4](https://github.com/meghjs/megh/compare/v0.5.3...v0.5.4) (2026-11-09)

### Bug Fixes

* **cli:** generate SQL Server-safe foreign keys ([a5712ac](https://github.com/meghjs/megh/commit/a5712ac1677e7bdcda6b5a2555dbf64d99c032ce))
* **openapi:** document @Query() parameters ([30d6a42](https://github.com/meghjs/megh/commit/30d6a42050a02dc823623948620d53f22ed442cf))

### Features

* **cli:** scaffold tables, domains, auth and RBAC from templates ([4817b02](https://github.com/meghjs/megh/commit/4817b022189b0bbea1c093f9cddf38655ad106ed))


## [0.5.3](https://github.com/meghjs/megh/compare/v0.5.2...v0.5.3) (2026-11-08)

### Bug Fixes

* **orm:** return inserted rows with OUTPUT on SQL Server ([2751a28](https://github.com/meghjs/megh/commit/2751a28b73b934b3475250c9488efbbbf0f2aa0c))
* **orm:** show the real SQL Server error when a transaction is aborted ([53c7e5b](https://github.com/meghjs/megh/commit/53c7e5bc91e4a9ee54ea13b4a1bc12b94f8b9fa7))
* **orm:** SQL Server inserts and column drops, plus a cross-database REST suite ([df9c175](https://github.com/meghjs/megh/commit/df9c175fbb1f24f281e966fc76a0b29f41b3ce68))

### Features

* **cli:** add update:model to sync a model with alter-table migrations ([09f43b8](https://github.com/meghjs/megh/commit/09f43b811086c18f4bd9e0b2cddacabba4d4277f))
* **cli:** document generated resources' responses; name nullable column types ([374fd2d](https://github.com/meghjs/megh/commit/374fd2d41c5b32a70319db0046342fc6231cec17))
* **cli:** make:factory with Faker values per column ([24cffde](https://github.com/meghjs/megh/commit/24cffdee82843960188f5cb20ef3ae626ab830b6))
* **cli:** make:seeder, db:seed and migrate --seed ([589ade5](https://github.com/meghjs/megh/commit/589ade5d9a0df24e9fc942f63ee6903d6503ef98))
* **openapi:** typed options and responses from DTOs and models ([fdf954f](https://github.com/meghjs/megh/commit/fdf954ff370ee78f0f93ac0594c567673c70cbaf))
* **orm:** model factories with Faker ([0886f4e](https://github.com/meghjs/megh/commit/0886f4e3fbdba95ca95671909ff424bd0654c7a1))
* **orm:** seeders with defineSeeder and a Seeders runner ([5e02c0f](https://github.com/meghjs/megh/commit/5e02c0f73422ff95ac62184ba25db9061d10269d))
* **orm:** type relation fields with the related model ([eb1f85d](https://github.com/meghjs/megh/commit/eb1f85d7bb842186c8ac8ad226e91e25254ec903))


## [0.5.2](https://github.com/meghjs/megh/compare/v0.5.1...v0.5.2) (2026-11-08)

### Bug Fixes

* **core:** resolve class middleware from @UseMiddleware through DI ([6896d9a](https://github.com/meghjs/megh/commit/6896d9aa9bebf5f334d55fe7bbf631151150f3b8))
* **orm:** page queries with top/offset-fetch on SQL Server ([e9b308b](https://github.com/meghjs/megh/commit/e9b308b9591c19489f32146cc85638845df206e1))


## [0.5.1](https://github.com/meghjs/megh/compare/v0.5.0...v0.5.1) (2026-11-08)

### Bug Fixes

* **core:** use the current Megh favicon in Swagger UI ([cf8bbcc](https://github.com/meghjs/megh/commit/cf8bbccb9721dc4ffd601e3b285f6a15a87dd7d7))
* derive resource routes from singularized names ([c30961a](https://github.com/meghjs/megh/commit/c30961afa8b05f6759213ea19effa56ce97668e8))

### Features

* **cli:** add make:resource and generate Megh ORM models from migrations ([9872959](https://github.com/meghjs/megh/commit/9872959a4fca8c3b5ee5faa72eb697e58642150a))
* **core:** extend the ORM query builder and models ([e2448fe](https://github.com/meghjs/megh/commit/e2448fe37bd6662477bcd20448f6fd90385039ca))
* **core:** inject() for field initializers, tokens and optional services ([9f55a7c](https://github.com/meghjs/megh/commit/9f55a7c8c5ec28da08c35f5e0344051bbd4cb5b8))
* **core:** MeghORM connects itself, decorators and a schema builder ([e351486](https://github.com/meghjs/megh/commit/e35148688ad6ca04b797e5cc24068e7ff374a0e2))
* **core:** replace typedi with Megh's own DI container ([82a8743](https://github.com/meghjs/megh/commit/82a87430ab689e06307368f2ff208f4a90cecd87))
* **core:** show the Megh logo and favicon in Swagger UI ([eff092e](https://github.com/meghjs/megh/commit/eff092eefdf8652799d3e123b82611dc7d9b6771))
* **orm:** DB query builder, decorator models from make:model, ORM in megh new ([d810a09](https://github.com/meghjs/megh/commit/d810a09bc617acbd3e50cc3ed41130996f419805))
* **orm:** map model properties to column names ([9cbebce](https://github.com/meghjs/megh/commit/9cbebce7ba369a123b3b755902e78769c66608a0))
* **rename:** rename Models (ORM) to MeghORM ([ac3369f](https://github.com/meghjs/megh/commit/ac3369f4244eb35fdbda0f86a30e1f4061db0f82))


# [0.5.0](https://github.com/meghjs/megh/compare/v0.4.1...v0.5.0) (2026-11-01)

* refactor!: rename Avleon to Megh ([e4239e0](https://github.com/meghjs/megh/commit/e4239e0b838b78115df655ccf8a25a5cb4c0c27a)), closes [megh-env](https://github.com/me/issues/env) [x-megh-request-body](https://github.com/x-me/issues/request-body)

### BREAKING CHANGES

* install @meghjs/core, @meghjs/cli and @meghjs/data in
  place of the [@avleon](https://github.com/avleon) packages. Avleon.createApplication() is now
  Megh.createApplication() and every Avleon* export is renamed to Megh*.
  The CLI command is megh, the package.json config key is "megh" (was
  "avleon"), plugins declare "megh": { "plugin" }, the generated types
  file is megh-env.d.ts, AVLEON_QUEUE_DRIVER and AVLEON_SKIP_INSTALL are
  MEGH_QUEUE_DRIVER and MEGH_SKIP_INSTALL, MEGH_KNEX_DB replaces
  AVLEON_KNEX_DB, and the OpenAPI extension is x-megh-request-body.


## [0.4.1](https://github.com/avleonjs/avleon/compare/v0.4.0...v0.4.1) (2026-10-31)

### Bug Fixes

* **core:** document request bodies in the generated OpenAPI spec ([ab9ad42](https://github.com/avleonjs/avleon/commit/ab9ad42646780d76c1ca73d8c9dec2eebf4af47d))

### Features

* **cli:** add make:migration and migrate commands ([0fd29c5](https://github.com/avleonjs/avleon/commit/0fd29c5a02596fb756df364cf3b0de2fa95c668a))
* **core:** add type-safe models and migrations on top of Kysely ([c81dc88](https://github.com/avleonjs/avleon/commit/c81dc8820cd9b9422aa109b3dc176f19ddb919fc))


# [0.4.0](https://github.com/avleonjs/avleon/compare/v0.3.0...v0.4.0) (2026-10-30)

* feat!: add a plugin system and move TypeORM and Knex into @avleon/data ([ec444bc](https://github.com/avleonjs/avleon/commit/ec444bc2e97a0686f15c36805edac4cf2e8691e8))
* test!: replace jest with vitest ([ddff510](https://github.com/avleonjs/avleon/commit/ddff51057108b48084ef259c1cd82d6520429dd4))
* fix(core)!: upgrade dependencies with known vulnerabilities ([6a2781f](https://github.com/avleonjs/avleon/commit/6a2781f47143c00a96825f753d2122e16355754a))

### Features

* **cli:** scaffold @avleon/data for database projects ([9858bc9](https://github.com/avleonjs/avleon/commit/9858bc9d995cd8a7f9a2f09cc486d6c0435afb19))

### BREAKING CHANGES

* core no longer exports MockDB, which called the global
  jest.fn() and only worked under Jest. Projects generated by `avleon new`
  use Vitest; existing projects are unaffected.
* core's optional peer ranges move from @fastify/static
  ^8.0.0 to ^10.1.2 and from @fastify/swagger-ui ^5.0.0 to ^6.1.2. Every
  8.x and 9.x release of @fastify/static is vulnerable to path traversal.
  Apps that use static files or Swagger UI must upgrade those plugins.
* useTypeORM, useKnex, InjectRepository, KnexDB,
  AvleonRepository and the other database APIs move from @avleon/core to
  @avleon/data; install it to keep using them. useDatasource(), the
  dataSourceOptions app option, TestAppOptions.dataSource and the unused
  KnexHooks types are removed. AvleonContainer exposes only get, set, has
  and reset, and @Utility()/@Helper() no longer take typedi options.
