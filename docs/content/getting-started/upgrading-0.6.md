---
title: Upgrading to 0.6
description: "What changes in Megh 0.6.0: removed no-op APIs, run() reading PORT, framework logs through the logger, a safer scaffolded .env, MeghScheduler exported, and new docs."
---

# Upgrading to 0.6

0.6.0 removes APIs that did nothing, makes `app.run()` read `PORT`, and sends
framework messages through the logger. Most apps only need to delete a call
or two. Read [Breaking in 0.6.0](#breaking-in-0-6-0) before upgrading.

A `0.x` minor release can contain breaking changes. See the
[versioning policy](/reference/versioning).

```sh
npm i @meghjs/core@^0.6.0
npm i -D @meghjs/cli@^0.6.0
```

## Breaking in 0.6.0

### Removed APIs

These did nothing, or were a second name for another API. Delete the calls,
or switch to the replacement:

| Removed | Use instead |
|---------|-------------|
| `app.useHttps()` | Nothing: it was a no-op. For HTTPS, pass `server: { https: { key, cert } }` to `Megh.createApplication()`, or terminate TLS at a proxy |
| `app.useSerialization()` | Nothing: it was a no-op |
| `app.mapFeatures()` | Nothing: it was a no-op |
| `MeghSocketIo` | Get the server with `MeghContainer.get(SocketIoServer)`. See [WebSocket](/microservices/websocket) |
| `DuplicateRouteException` | Nothing. Fastify already refuses duplicate routes at startup |
| `MeghRouter.mapRoute()`, `MeghRouter.registerMiddleware()` | `app.mapGet()` and the other `map*` methods, and `app.useMiddlewares()` |
| `CreateSwaggerObjectSchema`, `GetObjectSchema` | `generateClassSchema` |

Your type checker finds every call that needs changing.

### `app.run()` reads `PORT`

`app.run()` without a port now listens on the `PORT` environment variable,
like it already read `HOST`, and falls back to `4000`. A port passed to
`run()` still wins:

```ts
app.run();      // PORT, else 4000
app.run(3000);  // 3000, whatever PORT says
```

An app that calls `app.run()` without a port and has `PORT` set to something
else, for example by the hosting platform, now listens on `PORT`. That's
usually what you want. To keep the old behaviour, pass the port explicitly.

An invalid `PORT`, such as `abc`, now stops startup with an error.

Apps created by the CLI read `PORT` themselves in `serve.ts` and keep working.
You can simplify `serve.ts` to `app.run()`.

### Framework logs go through the logger

Framework messages that went to `console` now go through the
[logger](/advanced/logging). That includes the startup line
`Application running on <address>`, and warnings such as a route using
`@Authorized` with no authorization handler registered. In production they're
JSON lines like every other log entry.

If a test spied on `console.warn` or `console.error` to check one of these
messages, spy on the logger instead. See [Testing](/advanced/testing).

## Other changes

- **New projects leave `NODE_ENV` out of `.env`.** `megh serve` already runs
  the app in development and `megh start` in production. The old line turned
  on development mode, with error details in responses, when a project's
  `.env` was deployed and the app started with `node dist/serve.js`. In an
  existing project, remove `NODE_ENV=development` from `.env` if you deploy
  that file. See [Deployment](/production/deployment#environment).
- **`MeghScheduler` is exported**, for running scheduled tasks in a process
  without the HTTP app. See [Scheduler](/advanced/scheduler).
- **New docs:** [Application](/getting-started/application),
  [Configuration](/core-concept/configuration),
  [Scheduler](/advanced/scheduler), [Testing](/advanced/testing),
  [Deployment](/production/deployment),
  [Security Hardening](/production/security),
  [API Reference](/reference/api),
  [Versioning Policy](/reference/versioning) and
  [FAQ](/reference/faq).
- **Doc fixes:** `useStaticFiles` takes `root`, not `path`. `useMultipart`
  limits files to 10 MB unless you pass `limits`, on top of `FileStorage`'s
  50 MB.

## Coming from older versions

On 0.5.0 to 0.5.4, read [Upgrading to 0.5.5](/getting-started/upgrading-0.5)
first.
