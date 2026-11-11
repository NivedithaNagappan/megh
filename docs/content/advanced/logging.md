---
title: Logging
description: Structured logging with LoggerService.
---

# Logging

`LoggerService` wraps [pino](https://getpino.io). Inject it anywhere:

```ts [services/orders.service.ts]
import { AppService, LoggerService } from '@meghjs/core';

@AppService
export class OrdersService {
  constructor(private readonly logger: LoggerService) {}

  place(order: Order) {
    this.logger.info('order placed', { orderId: order.id });
  }

  fail(error: Error) {
    this.logger.error('order failed', error); // logged as { err }
  }
}
```

## Output format

| `NODE_ENV` | Output |
|------------|--------|
| `development`, with `pino-pretty` installed | Pretty, colored lines |
| anything else, including unset | One JSON object per line |

Install `pino-pretty` as a dev dependency for readable local logs:

```sh
npm i -D pino-pretty
```

Megh's own logs (events, queues, workers, scheduler) go through the same
logger, so they share its format and level.

## Configuring

All `LoggerService` instances share one pino root. Configure it once at
startup:

```ts
import { LoggerService } from '@meghjs/core';

LoggerService.configure({ level: 'debug' });     // also: pretty, destination

const log = LoggerService.child({ module: 'billing' });
log.info('invoice sent');
```

## Request IDs

Every request gets an ID. Megh reuses the incoming `x-request-id` header
when it is short and log-safe (letters, digits, `_ . : -`, at most 128
characters), so an ID set by a proxy or the calling service carries
through; otherwise it generates a UUID. The ID is sent back in the
`x-request-id` response header.

Log lines written while a request is handled get a `reqId` field, from
`LoggerService` and from Megh's own logs alike:

```json
{"level":30,"reqId":"7f9c…","msg":"charging card"}
```

Read the ID anywhere in the request's call chain with `getRequestId()`,
for example to pass it to another service:

```ts
import { getRequestId } from '@meghjs/core';

await fetch(url, { headers: { 'x-request-id': getRequestId() ?? '' } });
```

Change the header or the generator, or turn request IDs off, when you
create the app:

```ts
MeghApplication.getApp({
  requestId: { header: 'x-correlation-id', generate: () => nanoid() },
});
MeghApplication.getApp({ requestId: false });
```

`server.genReqId` in the Fastify options overrides Megh's generator.

## Fastify request logs

Megh does not pass this logger to Fastify. To route Fastify's request logs
through the same pino instance, use `LoggerService.getPino()`.
