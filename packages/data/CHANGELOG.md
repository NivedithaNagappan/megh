# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
