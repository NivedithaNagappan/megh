---
title: Moving from Avleon to Megh
description: Avleon is now Megh. How to move an Avleon project to the @meghjs packages.
---

# Moving from Avleon to Megh

Avleon has been renamed to **Megh** (মেঘ, Bengali for "cloud"). The framework
is the same: only the names change. The `@avleon/*` packages are deprecated
and get no new releases; new versions are published as `@meghjs/*`.

| Before | After |
|---|---|
| `@avleon/core` | `@meghjs/core` |
| `@avleon/cli` | `@meghjs/cli` |
| `@avleon/data` | `@meghjs/data` |
| github.com/avleonjs/avleon | [github.com/meghjs/megh](https://github.com/meghjs/megh) |
| avleonjs.github.io | [meghjs.github.io](https://meghjs.github.io) |

If you are on 0.3 or earlier, upgrade to Avleon 0.4 first
([Upgrading to 0.4](/getting-started/upgrading-0.4)), then follow this page.

## 1. Swap the packages

```sh
npm uninstall @avleon/core @avleon/cli @avleon/data
npm i @meghjs/core
npm i -D @meghjs/cli
npm i @meghjs/data   # only if you used @avleon/data
```

## 2. Rename the imports and APIs

Every export that started with `Avleon` now starts with `Megh`, and every
`AVLEON_` constant starts with `MEGH_`:

| Before | After |
|---|---|
| `Avleon.createApplication()` | `Megh.createApplication()` |
| `AvleonApplication`, `AvleonContainer`, `AvleonConfig`, `AvleonTest`, ... | `MeghApplication`, `MeghContainer`, `MeghConfig`, `MeghTest`, ... |
| `@AvleonWorker`, `AvleonEvent`, `AvleonRepository`, ... | `@MeghWorker`, `MeghEvent`, `MeghRepository`, ... |
| `AVLEON_KNEX_DB` | `MEGH_KNEX_DB` |

On macOS or Linux, this rewrites a typical project in one pass. Commit first,
then review the diff:

```sh
grep -rlE 'avleon|Avleon|AVLEON' src test package.json tsconfig.json *.d.ts 2>/dev/null \
  | xargs sed -i.bak -e 's#@avleon/#@meghjs/#g' -e 's/AVLEON/MEGH/g' \
                     -e 's/Avleon/Megh/g' -e 's/avleon/megh/g'
find . -name '*.bak' -not -path './node_modules/*' -delete
```

## 3. The CLI command is `megh`

```sh
npx megh serve          # was: npx avleon serve
npx megh make:controller users
npx megh migrate
```

Update the `scripts` in `package.json` (`avleon serve` → `megh serve`, and so on).

## 4. Configuration and generated files

| Before | After |
|---|---|
| `"avleon": { "entry", "database", "migrations" }` in `package.json` | `"megh": { ... }` |
| `avleon-env.d.ts` | `megh-env.d.ts`, with `@meghjs/data` in place of `@avleon/data`. Rename the file and update `tsconfig.json`'s `include`. |
| `AVLEON_QUEUE_DRIVER` env variable | `MEGH_QUEUE_DRIVER` |
| `AVLEON_SKIP_INSTALL` env variable | `MEGH_SKIP_INSTALL` |

## 5. For plugin authors

Plugins declare their entry under a `megh` key in `package.json`:

```json
{ "megh": { "plugin": "./dist/plugin.js" } }
```

Packages that still use the `avleon` key are not discovered. Rename the key
and import `MeghPlugin` from `@meghjs/core`.

## 6. OpenAPI

Request body metadata in the generated spec uses the `x-megh-request-body`
extension instead of `x-avleon-request-body`. This only matters if you
post-process the spec and look for that key.
