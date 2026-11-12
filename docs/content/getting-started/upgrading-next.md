---
title: Upcoming changes
description: Changes on main since 0.5.4 that can affect existing apps. This page becomes the upgrade guide for the next release.
---

# Upcoming changes

These changes are on `main` and will ship in the release after 0.5.4. Most
apps need no code changes, but check the items marked **Breaking**.

## Breaking

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

## New

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

## Fixes

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
