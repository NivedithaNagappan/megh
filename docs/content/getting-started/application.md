---
title: Application
description: Creating the app, its options, the use* methods, what run() does, lifecycle hooks and shutdown.
---

# Application

Every Megh app is one `MeghApplication`. You create it, turn features on with
`use*` methods, and start it with `run()`.

```ts [app.ts]
import { Megh } from '@meghjs/core';
import { UserController } from './controllers/user.controller';

const app = Megh.createApplication();

app
  .useCors({ origin: true })
  .useHealth()
  .useControllers([UserController]);

app.run(3000);
```

## Creating the app

`Megh.createApplication(options?)` returns the application. It's a singleton:
calling it again returns the same app, and the options of the later calls are
ignored. Pass every option in the first call.

| Option | Default | |
|--------|---------|---|
| `server` | | Fastify server options (`logger`, `bodyLimit`, `trustProxy`, `https`, …), passed to `Fastify()` |
| `requestId` | `{}` (on) | Request ID settings. `false` turns request IDs off. See [Logging](/advanced/logging) |
| `plugins` | `[]` | [Plugins](/advanced/plugins) to register explicitly |
| `autoloadPlugins` | `true` | Find plugins among the app's dependencies |
| `experimental.compiledValidation` | `MEGH_COMPILED_VALIDATION` env, else `false` | Compile DTO validation once per class. See [Validation](/core-concept/validation) |

```ts
const app = Megh.createApplication({
  server: {
    bodyLimit: 2 * 1024 * 1024, // 2 MB
    trustProxy: true,           // behind a load balancer
  },
});
```

### The Fastify instance

`app.app` is the underlying Fastify instance. Use it for anything Megh doesn't
wrap, such as registering a Fastify plugin:

```ts
import helmet from '@fastify/helmet';

app.app.register(helmet);
```

## Turning features on

Each `use*` method returns the app, so they chain. Call them before `run()`.

| Method | What it does | Guide |
|--------|--------------|-------|
| `useControllers([...])` or `useControllers({ auto: true, path? })` | Register controllers, or scan a folder (default `src/controllers`) | [Controllers](/core-concept/controller) |
| `useMiddlewares([...])` | Global middleware for every route | [Middleware](/core-concept/middleware) |
| `useAuthentication(Handler)` | Sets `request.user` on every request | [Authentication](/core-concept/authentication) |
| `useAuthorization(Handler)` | Decides access for `@Authorized` routes | [Authentication](/core-concept/authentication) |
| `useExceptionFilters(...)`, `useErrorHandler(fn)`, `useErrorLogger(...)` | Customise error responses and logging | [Error Handling](/core-concept/error-handling) |
| `useOpenApi(options)` | OpenAPI document and Swagger UI or Scalar | [OpenAPI](/microservices/openapi) |
| `useCors(options)` | CORS, through `@fastify/cors` | |
| `useMultipart(options)` | File uploads, through `@fastify/multipart` | [File Uploads](/advanced/file-uploads) |
| `useStaticFiles(options)` | Serve files, through `@fastify/static` | [File Uploads](/advanced/file-uploads) |
| `useCache(options)` | Memory or Redis cache | [Caching](/advanced/caching) |
| `useMeghORM(options)` | Database connection for MeghORM | [MeghORM](/advanced/orm) |
| `useScheduler([...])` or `useScheduler({ path })` | Scheduled tasks | [Scheduler](/advanced/scheduler) |
| `useWorker([...])` | Queue workers | [Queue](/advanced/queue) |
| `useSocketIo(options)` | Socket.IO server | [WebSocket](/microservices/websocket) |
| `useHealth(options)`, `addHealthCheck(name, fn)` | `/health` and `/ready` endpoints | [Health Checks](/advanced/health) |

Integrations are optional peer dependencies. If one isn't installed, the
`use*` call throws with the `npm install` command you need.

### `useGlobal`

`useGlobal` sets several features in one call. Each key calls the matching
`use*` method:

```ts
import path from 'path';

app.useGlobal({
  cors: { origin: ['https://example.com'] },
  openApi: { info: { title: 'My API', version: '1.0.0' } },
  controllers: [UserController],
  middlewares: [RequestTimer],
  authorization: AppAuthorization,
  multipart: { limits: { fileSize: 5 * 1024 * 1024 } },
  staticFiles: { root: path.join(process.cwd(), 'public') }, // must be absolute
});
```

| Key | Calls |
|-----|-------|
| `cors` | `useCors` |
| `openApi` | `useOpenApi` |
| `controllers` | `useControllers` |
| `middlewares` | `useMiddlewares` |
| `authorization` | `useAuthorization` |
| `multipart` | `useMultipart` |
| `staticFiles` | `useStaticFiles` |
| `scheduler` | `useScheduler` |

## Running the app

`run(port?, options?)` starts the app. The port defaults to `4000`:

```ts
app.run();      // :4000
app.run(3000);  // :3000
app.run(3000, { host: '127.0.0.1', shutdownTimeout: 20_000 });
```

| Option | Default | |
|--------|---------|---|
| `host` | `HOST` or `0.0.0.0` | Interface to listen on |
| `onListen` | | Called once the server is listening |
| `shutdownTimeout` | `10000` | Milliseconds to wait for a clean shutdown before exiting with code 1 |

The host defaults to `0.0.0.0` so the app is reachable inside a container.
Pass `127.0.0.1` to accept local connections only. `run()` can be called once;
a second call throws `App already running`.

### What `run()` does

In order:

1. Prepares the OpenAPI document, if `useOpenApi` was called.
2. Runs the `onInit` hooks. MeghORM connects to the database here.
3. Finds controllers (with `{ auto: true }`), then maps controller and inline routes.
4. Finds and starts scheduled tasks.
5. Installs the error handler and waits for Fastify to be ready.
6. Starts Socket.IO, if `useSocketIo` was called.
7. Listens for `SIGTERM` and `SIGINT`.
8. Starts listening on the port and logs `Application running on <address>`.
9. Runs the `onReady` hooks, then `onListen`.

A thrown error in steps 1 to 6 stops startup, and the server never listens.

## Lifecycle hooks

Register work to run at each stage of the app's life. Call these before
`run()`; each returns the app, so they chain:

```ts
app
  .onInit(async () => {
    // After the database connects, before routes are mapped and the server
    // listens. A thrown error aborts startup.
    await cache.warmUp();
  })
  .onReady(() => {
    // The server is listening.
  })
  .onClose(async () => {
    // On shutdown, after the server stops accepting requests.
    await metrics.flush();
  });
```

Hooks of the same kind run in the order you register them, except `onClose`
hooks, which run in reverse so that things set up last are torn down first.
A failing `onClose` hook is logged and the others still run.

## Shutting down

`await app.close()` shuts the app down, for example at the end of a test. In
order, it:

1. Stops the HTTP server, waiting for in-flight requests.
2. Stops scheduled tasks.
3. Closes queue workers.
4. Closes the cache, if `useCache` was called.
5. Runs the `onClose` hooks (MeghORM closes its connection in one).

Calling `close()` twice is safe: the second call waits for the first.

On `SIGTERM` or `SIGINT`, `run()` calls `close()` and exits with code 0. If
shutdown fails, or takes longer than `shutdownTimeout`, it exits with code 1.
See [Deployment](/production/deployment) for running behind a process manager
or in a container.

## Development and production

`app.isDevelopment()` is true only when `NODE_ENV=development`. An unset
`NODE_ENV` counts as production. In production mode, 5xx details are hidden
and logs are written as JSON. Set `NODE_ENV=development` locally to get
detailed errors, pretty logs and any docs you gate behind `isDevelopment()`:

```ts
if (app.isDevelopment()) {
  app.useOpenApi({ info: { title: 'My API', version: '1.0.0' } });
}
```

Megh loads `.env` into `process.env` when it is first imported. Set
`MEGH_DOTENV=false` to skip that and manage the environment yourself. See
[Configuration](/core-concept/configuration).
