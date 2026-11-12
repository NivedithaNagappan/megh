---
title: Testing
description: Unit testing controllers and services, and sending requests to your routes with MeghTest.
---

# Testing

`MeghTest` helps with two kinds of test:

- **Unit tests**: build a controller or service with its dependencies, and call
  its methods.
- **Route tests**: send requests to your app without opening a port.

The examples use [Vitest](https://vitest.dev), which `megh new` sets up.

## Setup

Megh's constructor injection needs decorator metadata, which Vitest's default
transform (esbuild) doesn't emit. Use SWC instead:

```sh
npm i -D vitest unplugin-swc @swc/core
```

```ts [vitest.config.mts]
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
```

`megh new` generates this file, plus `vitest.e2e.config.mts` for
`test/**/*.e2e-spec.ts`.

## Unit tests

`MeghTest.getController` and `MeghTest.getProvider` resolve a class through
[dependency injection](/core-concept/dependency-injection), with its
dependencies built for you:

```ts [src/controllers/home.controller.spec.ts]
import { beforeAll, describe, expect, it } from 'vitest';
import { MeghTest } from '@meghjs/core';
import { HomeController } from './home.controller';

describe('HomeController', () => {
  let controller: HomeController;

  beforeAll(() => {
    controller = MeghTest.getController(HomeController);
  });

  it('returns a greeting', () => {
    expect(controller.sayHello()).toEqual({ message: 'Hello World!' });
  });
});
```

### Replacing dependencies

Pass stand-ins as the second argument, in constructor parameter order:

```ts [src/services/user.service.spec.ts]
import { afterEach, expect, it, vi } from 'vitest';
import { MeghTest } from '@meghjs/core';
import { UserService } from './user.service';

// constructor(private users: UserRepository, private mailer: MailerService)
const users = { create: vi.fn(async (data) => ({ id: 1, ...data })) };
const mailer = { send: vi.fn() };

afterEach(() => MeghTest.clean());

it('sends a welcome mail', async () => {
  const service = MeghTest.getProvider(UserService, [users, mailer]);

  await service.register('a@example.com');

  expect(mailer.send).toHaveBeenCalledWith('a@example.com', 'Welcome!');
});
```

How this works matters:

- Each stand-in replaces that class in the **shared container**, not just for
  this one controller. Anything else that resolves `MailerService` afterwards
  gets the stand-in too.
- If the class under test was already built, it is returned as-is and the new
  stand-ins are ignored.
- Only constructor parameters are matched. For `inject()` fields, register
  the stand-in with `MeghContainer.set(MailerService, fake)` before resolving
  the class.

Call `MeghTest.clean()` after each test. It drops every built instance,
including stand-ins set for classes, so the next test starts fresh. Values set
for tokens and strings are kept. See [Testing in Dependency Injection](/core-concept/dependency-injection#testing).

## Route tests

`MeghTest.from(app)` wraps an app so you can send requests to it. Requests go
through Fastify's `inject()`, so no port is opened:

```ts [test/users.e2e-spec.ts]
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MeghTest, TestApplication } from '@meghjs/core';
import app from '../src/app';

describe('Users API', () => {
  let http: TestApplication;

  beforeAll(async () => {
    http = MeghTest.from(app);
    await new Promise((r) => setTimeout(r, 0)); // let routes finish mapping
  });

  afterAll(() => app.close());

  it('lists users', async () => {
    const res = await http.get('/users');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeInstanceOf(Array);
  });

  it('rejects an invalid body', async () => {
    const res = await http.post('/users', { payload: { email: 'nope' } });

    expect(res.statusCode).toBe(400);
  });
});
```

This uses the app exported from `src/app.ts`, so middleware, authentication,
exception filters and other `use*` settings apply. Keep `app.run()` in
`src/serve.ts`, as `megh new` does, so importing the app doesn't start it.

`TestApplication` has `get`, `post`, `put`, `patch`, `delete` and `options`.
Each takes a URL and Fastify's inject options (`payload`, `headers`, `query`,
`cookies`, ...). The response has `statusCode`, `headers`, `body` (a string)
and `json()`.

```ts
await http.get('/me', { headers: { authorization: `Bearer ${token}` } });
await http.get('/users', { query: { page: '2' } });
```

`http.getController(Controller, deps?)` is the same as
`MeghTest.getController`.

### Just a few controllers

`MeghTest.createTestApplication` builds a fresh app with only the controllers
you list:

```ts
const http = MeghTest.createTestApplication({ controllers: [UserController] });
const res = await http.get('/users');
```

It returns only the `TestApplication`, so there is no app to `close()`. Use
`MeghTest.from(app)` when you need middleware, a database, or teardown.

### What `from()` does and doesn't do

`MeghTest.from(app)` maps the controllers you passed to `useControllers([...])`
and installs the error handler. It does not call `run()`, so:

- Controllers from `useControllers({ auto: true })` are not found. List them.
- Inline routes (`app.mapGet`, `app.mapPost`, ...) are not mapped, and return
  404.
- `onInit` and `onReady` hooks don't run. MeghORM's connection is still
  created, but the startup connection check is skipped.
- Scheduled tasks don't start.
- The OpenAPI document and Socket.IO are not set up.

Call `from()` once per app, for example in `beforeAll`. Calling it again maps
the routes a second time, which fails.

::: warning Wait before the first request
`from()` starts mapping routes but doesn't wait for it to finish. Wait one
tick, as above, before the first request. Otherwise the request can reach
Fastify before every route is added and get a 404. If mapping fails, the
error is only printed to the console, and the routes are missing.
:::

## Teardown

Call `app.close()` after the tests. It closes the Fastify instance, queue
workers, the cache and the database connection (through the `onClose` hooks),
so the test process can exit:

```ts
afterAll(() => app.close());
```

## Queues in tests

Code that dispatches jobs needs Redis by default. Switch to an in-memory
[queue driver](/advanced/queue#running-without-redis) instead:

| Driver | Behaviour |
|--------|-----------|
| `memory` | Jobs run asynchronously in-process and honour `delay` |
| `sync` | `dispatch()` runs the job before it resolves and ignores `delay` |

The driver is picked when a queue is created. If `src/app.ts` calls
`useWorker([...])`, its queues are created as soon as the app is imported, so
set the driver in the environment:

```ts [vitest.e2e.config.mts]
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    env: { MEGH_QUEUE_DRIVER: 'memory' },
  },
});
```

Otherwise call `setQueueDriver('memory')` before anything resolves the queue.
With `memory`, wait for jobs to finish and reset between tests:

```ts
import { resetMemoryQueues, waitForMemoryQueues } from '@meghjs/core';

afterEach(() => resetMemoryQueues());

it('sends a welcome mail on signup', async () => {
  await http.post('/signup', { payload: { email: 'a@example.com' } });
  await waitForMemoryQueues();

  expect(mailer.sent).toHaveLength(1);
});
```

## Environment

`MeghTest` doesn't change `NODE_ENV`. Vitest sets it to `test`, which Megh
treats as production: `app.isDevelopment()` is false and 5xx responses hide
their message. Assert on status codes rather than 5xx error text.

`.env` is loaded in tests the same way as in the app. See
[Configuration](/core-concept/configuration).
