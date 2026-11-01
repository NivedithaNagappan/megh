---
title: Queue
description: Background jobs with BullMQ.
---

# Queue

Megh's queue is built on [BullMQ](https://docs.bullmq.io), which runs on
Redis. Both are optional peer dependencies:

```sh
npm i bullmq ioredis
```

There are two ways to work with jobs: a **queue class**, which both produces and
consumes jobs, and a **worker class**, which only consumes a queue someone else
fills.

## A queue

Extend `MeghQueue<T>` and decorate it with `@Queue`. `T` is the shape of the
job payload.

```ts [queues/email.queue.ts]
import { MeghQueue, Queue, JobHandler, Job } from '@meghjs/core';

export type EmailPayload = {
  to: string;
  subject: string;
};

@Queue({
  name: 'email',
  adapter: { connection: { host: '127.0.0.1', port: 6379 } },
})
export class EmailQueue extends MeghQueue<EmailPayload> {
  constructor() {
    super();
  }

  @JobHandler('welcome')
  async sendWelcome(job: Job<EmailPayload>) {
    console.log(`Sending welcome mail to ${job.data.to}`);
  }

  @JobHandler('reset-password')
  async sendReset(job: Job<EmailPayload>) {
    console.log(`Sending reset mail to ${job.data.to}`);
  }
}
```

::: warning
In 0.3.0, a `@Queue` class must declare a constructor that calls
`super()`. Without one, resolving it through dependency injection gives it the
wrong queue name. Inject other services through the same constructor.
:::

Each `@JobHandler('name')` handles jobs added under that name. For jobs added
without a name — or with a name no handler matches — define a `handler` method
on the class, or pass `handler` in the decorator config.

### Registering

`useWorker` resolves the class through the container, which is what starts its
worker. Workers are closed automatically when the app shuts down.

```ts [app.ts]
import { Megh } from '@meghjs/core';
import { EmailQueue } from './queues/email.queue';

const app = Megh.createApplication();

app.useWorker([EmailQueue]);

export default app;
```

### Adding jobs

Inject the queue anywhere and call `add`:

```ts [services/signup.service.ts]
import { AppService } from '@meghjs/core';
import { EmailQueue } from '../queues/email.queue';

@AppService
export class SignupService {
  constructor(private readonly emailQueue: EmailQueue) {}

  async register(email: string) {
    await this.emailQueue.add('welcome', {
      to: email,
      subject: 'Welcome aboard',
    });
  }
}
```

Other producer methods:

```ts
// run 30 seconds from now
await emailQueue.delay('welcome', { to, subject }, 30_000);

// add with any BullMQ job option
await emailQueue.add('welcome', { to, subject }, { attempts: 3, backoff: 1000 });

// inspect and control
const job = await emailQueue.getJob(jobId);
await emailQueue.pause();
await emailQueue.resume();
```

### Producer-only queues

When another process consumes the jobs, pass `worker: false`. The queue only
adds jobs and never starts a worker:

```ts
@Queue({ name: 'report', worker: false })
export class ReportProducer extends MeghQueue<ReportPayload> {
  constructor() {
    super();
  }
}
```

## A worker

When the producer lives elsewhere, extend `MeghWorkerBase<T>` and point
`@MeghWorker` at the queue name. Implement `process`; the lifecycle hooks are
optional.

```ts [workers/report.worker.ts]
import { MeghWorker, MeghWorkerBase, Job } from '@meghjs/core';

export type ReportPayload = { reportId: number };

@MeghWorker({
  queue: 'report',
  concurrency: 5,
  connection: { host: '127.0.0.1', port: 6379 },
})
export class ReportWorker extends MeghWorkerBase<ReportPayload> {
  async process(job: Job<ReportPayload>) {
    return { generated: job.data.reportId };
  }

  onCompleted(job: Job<ReportPayload>, result: any) {
    console.log(`Report ${job.data.reportId} done`, result);
  }

  onFailed(job: Job<ReportPayload> | undefined, error: Error) {
    console.error(`Report failed:`, error.message);
  }
}
```

Register it the same way:

```ts
app.useWorker([EmailQueue, ReportWorker]);
```

Since 0.3, decorating a class with `@MeghWorker` does not start it. A worker
starts when it is registered with `app.useWorker([...])` or when you call
`.start()` yourself.

Errors thrown by `onCompleted`, `onFailed` and `onError` are caught and logged,
so a faulty hook cannot crash the process. Failed jobs are always logged.

::: info
`bullmq` is loaded lazily, only when a queue or worker actually starts — so
importing `@meghjs/core` never requires Redis to be running.
:::

## Running without Redis

For tests and local development, switch to an in-memory driver. No `bullmq` or
Redis is needed:

| Driver | Behaviour |
|--------|-----------|
| `bullmq` | Default. Jobs go to Redis. |
| `memory` | Jobs run asynchronously in-process and honour `delay`. |
| `sync` | `add()` runs the job before it resolves and ignores `delay`. |

Megh picks a driver in this order: the `driver` option on `@Queue` or
`@MeghWorker`, then `setQueueDriver()`, then the `MEGH_QUEUE_DRIVER`
environment variable, then `bullmq`.

```ts [signup.service.test.ts]
import { setQueueDriver, waitForMemoryQueues, resetMemoryQueues } from '@meghjs/core';

beforeAll(() => setQueueDriver('memory'));
afterEach(() => resetMemoryQueues());

it('sends a welcome mail', async () => {
  await signupService.register('a@example.com');
  await waitForMemoryQueues(); // wait for queued jobs to finish
  expect(mailer.sent).toHaveLength(1);
});
```

The memory driver supports `attempts`, concurrency, pause and resume, and keeps
failed jobs.
