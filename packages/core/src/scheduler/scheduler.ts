/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */

import { Container } from "../di";
import {
  CRON_META_KEY,
  INTERVAL_META_KEY,
  TIMEOUT_META_KEY,
  CronJobMeta,
  IntervalJobMeta,
  TimeoutJobMeta,
  isScheduledTask,
  collectJobMeta,
} from "./schedule-registry";
import { Constructor } from "../common/helpers";
import { internalLogger } from "../observability/internal-logger";

const logger = internalLogger("scheduler");

// ─── Lazy loader ──────────────────────────────────────────────────────────────

function requireNodeCron() {
  try {
    return require("node-cron");
  } catch {
    throw new Error(
      "[Megh] node-cron is not installed.\n" +
        "Run: npm install node-cron\n" +
        "And for types: npm install -D @types/node-cron",
    );
  }
}

// ─── Internal handle types ────────────────────────────────────────────────────

interface CronHandle {
  kind: "cron";
  label: string;
  task: { stop(): void; destroy?(): void };
}

interface IntervalHandle {
  kind: "interval";
  label: string;
  id: ReturnType<typeof setInterval>;
}

interface TimeoutHandle {
  kind: "timeout";
  label: string;
  id: ReturnType<typeof setTimeout>;
}

type JobHandle = CronHandle | IntervalHandle | TimeoutHandle;

// ─── Scheduler ────────────────────────────────────────────────────────────────

export class MeghScheduler {
  private handles: JobHandle[] = [];
  private taskClasses: Constructor<any>[] = [];

  // ── Registration ────────────────────────────────────────────────────────────

  addTaskClasses(tasks: Constructor<any>[]): void {
    for (const cls of tasks) {
      if (!this.taskClasses.includes(cls)) {
        this.taskClasses.push(cls);
      }
    }
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────────

  /**
   * Called once from MeghApplication.run(), after the database is ready.
   * Iterates every registered task class and wires up all job decorators.
   */
  start(): void {
    for (const cls of this.taskClasses) {
      if (!isScheduledTask(cls)) {
        logger.warn(
          `[Megh Scheduler] "${cls.name}" is not decorated with @ScheduledTask() — skipping.`,
        );
        continue;
      }

      // Resolve through the container so constructor injection works
      const instance = Container.get(cls) as any;

      this._registerCronJobs(cls, instance);
      this._registerIntervalJobs(cls, instance);
      this._registerTimeoutJobs(cls, instance);
    }

    if (this.handles.length > 0) {
      logger.info(
        `[Megh Scheduler] Started ${this.handles.length} job(s): ` +
          this.handles.map((h) => h.label).join(", "),
      );
    }
  }

  // ── Cron ─────────────────────────────────────────────────────────────────────

  private _registerCronJobs(cls: Constructor<any>, instance: any): void {
    const jobs: CronJobMeta[] = collectJobMeta<CronJobMeta>(CRON_META_KEY, cls);

    for (const job of jobs) {
      if (job.options?.disabled) {
        logger.info(
          `[Megh Scheduler] Cron "${this._label(cls, job)}" is disabled — skipping.`,
        );
        continue;
      }

      const nodeCron = requireNodeCron();

      if (!nodeCron.validate(job.expression)) {
        throw new Error(
          `[Megh Scheduler] Invalid cron expression "${job.expression}" ` +
            `on ${cls.name}#${job.methodName}`,
        );
      }

      // Wrap so a throwing job doesn't crash the process
      const runner = this._safeRunner(cls, job.methodName, instance);

      const label = this._label(cls, job);
      // node-cron v4 starts the task on schedule(); there is no `scheduled` option.
      const cronTask = nodeCron.schedule(job.expression, runner, {
        timezone: job.options?.timezone,
        name: label,
      });

      this.handles.push({ kind: "cron", label, task: cronTask });

      // runOnInit: fire immediately in addition to the schedule
      if (job.options?.runOnInit) {
        runner();
      }
    }
  }

  // ── Interval ──────────────────────────────────────────────────────────────────

  private _registerIntervalJobs(cls: Constructor<any>, instance: any): void {
    const jobs: IntervalJobMeta[] = collectJobMeta<IntervalJobMeta>(
      INTERVAL_META_KEY,
      cls,
    );

    for (const job of jobs) {
      if (job.options?.disabled) {
        logger.info(
          `[Megh Scheduler] Interval "${this._label(cls, job)}" is disabled — skipping.`,
        );
        continue;
      }

      const runner = this._safeRunner(cls, job.methodName, instance);
      const id = setInterval(runner, job.ms);
      const label = this._label(cls, job);
      this.handles.push({ kind: "interval", label, id });
    }
  }

  // ── Timeout ───────────────────────────────────────────────────────────────────

  private _registerTimeoutJobs(cls: Constructor<any>, instance: any): void {
    const jobs: TimeoutJobMeta[] = collectJobMeta<TimeoutJobMeta>(
      TIMEOUT_META_KEY,
      cls,
    );

    for (const job of jobs) {
      if (job.options?.disabled) {
        logger.info(
          `[Megh Scheduler] Timeout "${this._label(cls, job)}" is disabled — skipping.`,
        );
        continue;
      }

      const runner = this._safeRunner(cls, job.methodName, instance);
      const id = setTimeout(() => {
        // Remove from handles after it fires so stopAll() doesn't try to clear it
        runner();
        this.handles = this.handles.filter(
          (h) => !(h.kind === "timeout" && h.id === id),
        );
      }, job.ms);

      const label = this._label(cls, job);
      this.handles.push({ kind: "timeout", label, id });
    }
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────────

  /**
   * Stops every running job. Called automatically on SIGTERM / SIGINT
   * from MeghApplication.run().
   */
  stopAll(): void {
    for (const handle of this.handles) {
      try {
        if (handle.kind === "cron") {
          handle.task.stop();
          handle.task.destroy?.();
        } else if (handle.kind === "interval") {
          clearInterval(handle.id);
        } else {
          clearTimeout(handle.id);
        }
      } catch (e) {
        logger.warn(
          { err: e },
          `[Megh Scheduler] Error stopping "${handle.label}"`,
        );
      }
    }

    if (this.handles.length > 0) {
      logger.info(`[Megh Scheduler] Stopped ${this.handles.length} job(s).`);
    }

    this.handles = [];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /**
   * Wraps a job method so uncaught errors are logged but never bubble up
   * to crash the process. Also guards against concurrent cron invocations
   * (if a previous tick is still running, the new one is skipped).
   */
  private _safeRunner(
    cls: Constructor<any>,
    methodName: string,
    instance: any,
  ): () => void {
    let running = false;
    const label = `${cls.name}#${methodName}`;

    return async function () {
      if (running) {
        logger.warn(
          `[Megh Scheduler] "${label}" previous run still in progress — skipping tick.`,
        );
        return;
      }
      running = true;
      try {
        await instance[methodName]();
      } catch (err: any) {
        logger.error(
          { err },
          `[Megh Scheduler] Error in "${label}": ${err?.message ?? err}`,
        );
      } finally {
        running = false;
      }
    };
  }

  private _label(
    cls: Constructor<any>,
    job: { methodName: string; options?: { name?: string } },
  ): string {
    return job.options?.name ?? `${cls.name}#${job.methodName}`;
  }
}
