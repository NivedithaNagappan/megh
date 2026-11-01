---
title: Upgrading to 0.3
description: Breaking changes from 0.2 and known issues in 0.3.0.
---

# Upgrading to 0.3

::: info Avleon is now Megh
This guide predates the rename and uses the old `@avleon/*` names. After
upgrading, follow [Moving from Avleon to Megh](/getting-started/upgrading-megh).
:::

`@avleon/core` 0.3 closes several security holes and unifies APIs that were
inconsistent in 0.2. Most apps need a few changes, listed below.

## 1. Install the peer dependencies you use

Integrations moved from `dependencies` to optional peer dependencies. Install
`class-validator` and `class-transformer` in every project, plus whichever of
these you use:

```sh
npm i @fastify/cors                                   # useCors
npm i @fastify/multipart                              # useMultipart, @UploadFile
npm i @fastify/static                                 # useStaticFiles
npm i @fastify/swagger @fastify/swagger-ui            # useOpenApi (Swagger UI)
npm i @fastify/swagger @scalar/fastify-api-reference  # useOpenApi (Scalar)
npm i socket.io fastify-socket.io                     # useSocketIo
npm i -D pino-pretty                                  # pretty dev logs
```

The package is CommonJS only, with an `exports` map. Imports from
`@avleon/core/dist/...` no longer resolve; import from `@avleon/core`. The license
is now MIT.

## 2. Set `NODE_ENV=development` locally

`app.isDevelopment()` is now true only when `NODE_ENV=development`. An unset
`NODE_ENV` counts as production, which:

- turns off anything behind `if (app.isDevelopment())`, such as OpenAPI docs,
- hides the message and data of 5xx errors,
- switches logs to JSON.

## 3. Authorization denies by default

- A route with `@Authorized` returns **403** if no authorizer is registered.
- An authorizer that returns `false` now denies with 403. Throwing still works.
- `AuthorizeMiddleware`, `AppAuthorization`, `AuthHandler` and
  `AuthReturnTypes` were removed. Write a plain class with an `authorize()`
  method:

```ts
// before
@CanAuthorize
class JwtAuthorization extends AuthorizeMiddleware { ... }

// after
@CanAuthorize
class JwtAuthorization {
  async authorize(req: IRequest, options?: { roles?: string[] }) {
    if (!req.user) return false;
  }
}
```

See [Authentication](/core-concept/authentication).

## 4. Validation is stricter

- Properties not declared on a `@Body()`/`@Query()` DTO are rejected with 400.
- The handler receives the DTO instance, not the plain object.
- The 400 response body changed:

```json
// before
{ "code": 400, "error": "ValidationError", "errors": [ ... ] }

// after
{ "code": 400, "status": "Error", "message": "msg1; msg2", "errors": [ ... ] }
```

## 5. One pagination shape

Every paginator now takes `{ page, perPage }` and returns
`{ data, meta: { total, page, perPage, lastPage, next, prev } }`. The old shapes
(`{ total, totalPage, next, data }` and `{ data, total, page, limit, totalPages, hasNext, hasPrev }`)
are gone. `take`, `skip` and `limit` are still accepted but deprecated. See
[Pagination](/advanced/database#pagination).

## 6. File storage is safe by default

- Saved files get random UUID names. Use `saveAs` (formerly `as`) or
  `preserveFilename: true` to choose the name.
- `overwrite` defaults to `false`.
- An extension allowlist and a 50 MB size limit apply.
- `download`, `downloadAs` and `getUploadFile` resolve paths relative to the
  storage `baseDir` and reject anything outside it.
- `save` returns `{ filename, originalFilename, size, uploadPath, staticPath }`.
- `UploadFileFromRequest`'s `dest` is now a directory path string.

See [File Uploads](/advanced/file-uploads).

## 7. Events, queues and cache

- `EventDispatcher.dispatch` takes an `AvleonEvent` instance, not a string.
- Kafka and RabbitMQ broadcast throw "not implemented". Socket broadcast
  requires `app.useSocketIo()`.
- `EventRegistry.getListeners` takes a class or event, and `flushOnce` was
  removed.
- `@AvleonWorker` no longer starts on import. Register workers with
  `app.useWorker([...])`.
- The in-memory cache enforces TTLs, and each `new CacheManager()` has its own
  store.

## 8. Removed exports

`registerKnex`, `FEATURE_KEY`, `uuid`, `getLineNumber`, `MatchLocation`,
`extrctParamFromUrl`, `findDuplicates`, `isClassValidator`, `validateRequestBody`,
`OkOptions`, `Results.code`, `KafkaBroadcastOption`, `RabbitMqBroadcastOption`,
and the `ControllerOptions` fields `version`, `since` and `meta`.

`Results.Ok(x)` now serializes as `{ headers, data, statusCode }`.

## Known issues in 0.3.0

These are expected to be fixed in a patch release:

| Issue | Workaround |
|-------|------------|
| `@UseMiddleware(SomeClass)` crashes `app.run()` | Pass an instance: `@UseMiddleware(new SomeClass())`, or use `app.useMiddlewares()` |
| `@Repository` and `@Queue` classes without a constructor break under DI | Add `constructor() { super(); }` |
| `Results.Created`/`NoContent`/`NotFound`, `HttpResponse.Created` and `@HttpCode` respond with 200 | Throw `HttpExceptions` for error statuses |
| `@Body()`/`@Query()` DTOs are missing from the OpenAPI document | Describe them with `@OpenApi({ requestBody, query })` |
| `@All()` crashes `app.run()` | Register each method separately |
| Upload policy violations return 500 instead of 400/413 | None |
| `app.run()` has no `host` option and binds to localhost | Put a reverse proxy in front, or wait for the fix |
