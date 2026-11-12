---
title: Scheduler
description: Running methods on a cron schedule, a fixed interval, or once after startup.
---

# Scheduler

Run code on a schedule with decorators. Mark a class with `@ScheduledTask()`,
then decorate its methods with `@Cron`, `@Interval` or `@Timeout`.

Cron support comes from [node-cron](https://github.com/node-cron/node-cron),
which is installed with `@meghjs/core`.

## A task class

```ts [src/tasks/report.task.ts]
import { Cron, Interval, ScheduledTask, Timeout } from '@meghjs/core';
import { ReportService } from '../services/report.service';
import { CacheWarmer } from '../services/cache-warmer.service';

@ScheduledTask()
export class ReportTask {
  constructor(
    private readonly reports: ReportService,
    private readonly cache: CacheWarmer,
  ) {}

  @Cron('0 8 * * 1-5', { timezone: 'Asia/Dhaka' }) // 08:00 on weekdays
  async sendDailyReport() {
    await this.reports.sendDaily();
  }

  @Interval(60_000) // every minute
  async pollPending() {
    await this.reports.processPending();
  }

  @Timeout(5_000) // once, 5 seconds after startup
  async warmCache() {
    await this.cache.warmUp();
  }
}
```

`@ScheduledTask()` takes parentheses. A class can have any number of scheduled
methods, and one method can carry several decorators.

## Registering tasks

Pass the classes to `useScheduler`:

```ts [src/app.ts]
import { Megh } from '@meghjs/core';
import { ReportTask } from './tasks/report.task';

const app = Megh.createApplication();
app.useScheduler([ReportTask]);
```

Or scan a folder:

```ts
app.useScheduler({ path: 'src/tasks' });
```

The scan works like controller auto-discovery:

- `src/tasks` is the conventional folder.
- Subfolders are scanned too. Files ending in `.test`, `.spec` or `.e2e-spec`
  are skipped.
- Every exported class marked with `@ScheduledTask()` is registered. Other
  exports are ignored.
- In a compiled app, a leading `src` is swapped for `dist` and `.js` files are
  loaded. Under ts-node, the `.ts` files in `src` are loaded. An absolute path
  is used as-is.
- A missing folder logs a warning and the app starts without those tasks.

A class registered in the list and found by the scan runs once, not twice.

## Decorators

| Decorator | Runs |
|-----------|------|
| `@Cron(expression, options?)` | On a cron expression |
| `@Interval(ms, options?)` | Every `ms` milliseconds, first run after `ms` |
| `@Timeout(ms, options?)` | Once, `ms` milliseconds after the scheduler starts |

The expression is a 5-field cron string, or 6 fields with seconds first:

```ts
@Cron('0 0 * * *')          // midnight every day
@Cron('*/5 * * * *')        // every 5 minutes
@Cron('*/10 * * * * *')     // every 10 seconds
```

### Options

All three decorators take:

| Option | Default | Description |
|--------|---------|-------------|
| `name` | `ClassName#method` | Name shown in logs |
| `disabled` | `false` | Skip this job. It is logged as disabled and never runs |

`@Cron` also takes:

| Option | Default | Description |
|--------|---------|-------------|
| `timezone` | server time | IANA zone, such as `'Asia/Dhaka'` or `'Europe/London'` |
| `runOnInit` | `false` | Also run once when the scheduler starts |

`disabled` is handy for feature flags:

```ts
@Cron('0 3 * * *', { disabled: process.env.NIGHTLY_CLEANUP !== 'true' })
async cleanup() { ... }
```

## Dependency injection

Task classes are resolved through [dependency injection](/core-concept/dependency-injection),
so constructor parameters and `inject()` both work. Each class is built once
when the scheduler starts, and that instance is shared with the rest of the
app.

```ts
@ScheduledTask()
export class CleanupTask {
  private readonly sessions = inject(SessionService);

  @Cron('0 * * * *')
  async purge() {
    await this.sessions.deleteExpired();
  }
}
```

Scheduled methods are inherited. A subclass can override one by redeclaring
the method with the same kind of decorator (`@Cron`, `@Interval` or
`@Timeout`).

## When tasks run

Tasks start inside `app.run()`, after the `onInit` hooks (so MeghORM is
connected) and after routes are mapped, but before the server listens. They
stop in `app.close()`, right after the HTTP server stops. See
[Application](/getting-started/application) for the full order.

This means:

- `@Timeout(0)` and `runOnInit` jobs can run before the server accepts
  requests and before `onReady`.
- Nothing runs if you never call `run()`, for example in tests.
- `close()` does not wait for a job that is in the middle of running. Make
  long jobs safe to interrupt.

An invalid cron expression throws when the scheduler starts, so `run()` fails
with `Invalid cron expression "..." on ReportTask#sendDailyReport`.

## Errors and overlapping runs

A job that throws or rejects is logged at `error` level and keeps its
schedule. It never crashes the process. Logs go through the
[logger](/advanced/logging):

```
[Megh Scheduler] Error in "ReportTask#sendDailyReport": SMTP timeout
```

If a run is still going when the next one is due, the new run is skipped with
a warning. A slow `@Interval(1000)` job never runs twice at once.

Handle errors you care about inside the job, for example to alert or retry.

## Multiple replicas

::: warning
Every process that calls `run()` runs every task. With three replicas behind a
load balancer, a daily report is sent three times. Megh has no distributed
locking yet.
:::

Until it does, pick one of these:

- Only register tasks in one process, using an environment variable:

  ```ts [src/app.ts]
  if (process.env.RUN_SCHEDULER === 'true') {
    app.useScheduler({ path: 'src/tasks' });
  }
  ```

- Make the jobs idempotent, or take a lock yourself (a database row, a Redis
  `SET NX`) at the start of each job.
- Have the task push work onto a [queue](/advanced/queue) with a fixed
  `jobId`, such as the date, via `dispatch(name, data, 0, { jobId })`. BullMQ
  ignores a job whose ID already exists.

See [Deployment](/production/deployment) for running replicas.

## `MeghScheduler`

`useScheduler` is enough for most apps. `MeghScheduler` is the class behind it,
for running tasks in a process without the HTTP app, such as a dedicated
scheduler container:

```ts [src/scheduler.ts]
import { MeghScheduler } from '@meghjs/core';
import { ReportTask } from './tasks/report.task';
import { CleanupTask } from './tasks/cleanup.task';

const scheduler = new MeghScheduler();
scheduler.addTaskClasses([ReportTask, CleanupTask]);
scheduler.start();

const stop = () => {
  scheduler.stopAll();
  process.exit(0);
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
```

| Method | Description |
|--------|-------------|
| `addTaskClasses(classes)` | Add task classes. Adding the same class again is ignored |
| `start()` | Build each class and start its jobs. Call it once |
| `stopAll()` | Stop every job |

Outside `app.run()` there are no lifecycle hooks, so anything the tasks need,
such as a database connection, must be set up before `start()`. A class
without `@ScheduledTask()` is skipped with a warning.
