---
title: Upcoming changes
description: Changes on main since 0.5.5 that can affect existing apps. This page becomes the upgrade guide for the next release.
---

# Upcoming changes

These changes are on `main` and will ship in the next release, 0.6.0. It
contains breaking changes, so read this list before upgrading. See the
[versioning policy](/reference/versioning) for why a `0.x` minor release can
break.

The changes that were on this page before shipped in 0.5.5. See
[Upgrading to 0.5.5](/getting-started/upgrading-0.5).

## Removed APIs

These did nothing, or were a second name for another API. Delete the calls,
or switch to the replacement:

| Removed | Use instead |
|---------|-------------|
| `app.useHttps()` | Nothing: it was a no-op. For HTTPS, pass `server: { https: { key, cert } }` to `Megh.createApplication()`, or terminate TLS at a proxy |
| `app.useSerialization()` | Nothing: it was a no-op |
| `app.mapFeatures()` | Nothing: it was a no-op |
| `MeghSocketIo` | Inject the server with `inject(SocketIoServer)`. See [WebSocket](/microservices/websocket) |
| `DuplicateRouteException` | Nothing. Fastify already refuses duplicate routes at startup |
| `MeghRouter.mapRoute()`, `MeghRouter.registerMiddleware()` | `app.mapGet()` and the other `map*` methods, and `app.useMiddlewares()` |
| `CreateSwaggerObjectSchema`, `GetObjectSchema` | `generateClassSchema` |

Your type checker finds every call that needs changing.

## Logging

Framework messages that went to `console` now go through the
[logger](/advanced/logging). That includes the startup line
`Application running on <address>`, and warnings such as a route using
`@Authorized` with no authorization handler registered. In production they're
JSON lines like every other log entry.

If a test spied on `console.warn` or `console.error` to check one of these
messages, spy on the logger instead.
