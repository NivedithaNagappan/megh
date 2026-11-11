/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import type { FastifyInstance } from "fastify";

/**
 * A readiness check. It passes unless it throws, rejects or returns `false`.
 *
 *   app.addHealthCheck("redis", () => redis.ping())
 */
export type HealthCheck = () => unknown | Promise<unknown>;

export interface HealthOptions {
  /** Liveness route: answers 200 while the process can serve requests. Defaults to `/health`. */
  path?: string;
  /** Readiness route: runs every check, 503 if any fails. Defaults to `/ready`. */
  readyPath?: string;
  /** Extra checks, in addition to the ones plugins register. */
  checks?: Record<string, HealthCheck>;
  /** Milliseconds before a check counts as failed. Defaults to 5000. */
  timeout?: number;
}

export interface HealthCheckResult {
  status: "up" | "down";
  durationMs: number;
  /** Why the check failed. Development only, since it can describe internals. */
  error?: string;
}

export interface ReadinessReport {
  status: "ok" | "error";
  checks: Record<string, HealthCheckResult>;
}

/** Route config flag that makes global `useMiddlewares` skip a route. */
export const SKIP_GLOBAL_MIDDLEWARE = "meghSkipGlobalMiddleware";

/** Runs readiness checks and serves the health routes. */
export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  add(name: string, check: HealthCheck) {
    if (typeof check !== "function") {
      throw new TypeError(`[Megh] Health check "${name}" must be a function.`);
    }
    if (this.checks.has(name)) {
      throw new Error(
        `[Megh] A health check named "${name}" is already registered.`,
      );
    }
    this.checks.set(name, check);
  }

  names(): string[] {
    return [...this.checks.keys()];
  }

  /** Run every check concurrently. */
  async run(timeout = 5000, exposeErrors = false): Promise<ReadinessReport> {
    const entries = await Promise.all(
      [...this.checks].map(async ([name, check]) => {
        const started = performance.now();
        let error: unknown;
        try {
          const passed = await withTimeout(
            Promise.resolve().then(check),
            timeout,
          );
          if (passed === false) error = new Error("check returned false");
        } catch (err) {
          error = err;
        }
        const result: HealthCheckResult = {
          status: error === undefined ? "up" : "down",
          durationMs: Math.round(performance.now() - started),
        };
        if (error !== undefined && exposeErrors) {
          result.error = String((error as any)?.message ?? error);
        }
        return [name, result] as const;
      }),
    );
    const checks = Object.fromEntries(entries);
    const ok = entries.every(([, r]) => r.status === "up");
    return { status: ok ? "ok" : "error", checks };
  }

  /** Register the liveness and readiness routes. */
  install(
    app: FastifyInstance,
    options: HealthOptions,
    isDevelopment: () => boolean,
  ) {
    const timeout = options.timeout ?? 5000;
    // Hidden from the OpenAPI document; not behind authentication, since
    // they are registered on Fastify directly rather than through a controller.
    const schema = { hide: true } as any;

    const config = { [SKIP_GLOBAL_MIDDLEWARE]: true };

    app.get(options.path ?? "/health", { schema, config }, async () => ({
      status: "ok",
    }));

    app.get(
      options.readyPath ?? "/ready",
      { schema, config },
      async (_req, reply) => {
        const report = await this.run(timeout, isDevelopment());
        return reply.code(report.status === "ok" ? 200 : 503).send(report);
      },
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms}ms`)),
        ms,
      );
      timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}
