# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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

**Note:** Version bump only for package @avleon/data





# [0.4.0](https://github.com/avleonjs/avleon/compare/v0.3.0...v0.4.0) (2026-10-30)

* feat!: add a plugin system and move TypeORM and Knex into @avleon/data ([ec444bc](https://github.com/avleonjs/avleon/commit/ec444bc2e97a0686f15c36805edac4cf2e8691e8))

### BREAKING CHANGES

* useTypeORM, useKnex, InjectRepository, KnexDB,
  AvleonRepository and the other database APIs move from @avleon/core to
  @avleon/data; install it to keep using them. useDatasource(), the
  dataSourceOptions app option, TestAppOptions.dataSource and the unused
  KnexHooks types are removed. AvleonContainer exposes only get, set, has
  and reset, and @Utility()/@Helper() no longer take typedi options.
