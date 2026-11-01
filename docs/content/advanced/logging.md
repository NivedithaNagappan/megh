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

## Fastify request logs

Megh does not pass this logger to Fastify. To route Fastify's request logs
through the same pino instance, use `LoggerService.getPino()`.
