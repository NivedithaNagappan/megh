/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import { Constructor } from "../common/helpers";
import { MeghMiddleware } from "../http/middleware";
import { MeghConfig } from "../config/config";
import type { MeghAuthentication } from "../security/authentication";
import { OpenApiUiOptions } from "../openapi/openapi";
import {
  FastifyServerOptions,
  InjectOptions,
  LightMyRequestResponse,
} from "fastify";
import type { RedisOptions } from "ioredis";
import type { PluginOptions } from "../plugins/registry";
import type { RequestIdOptions } from "../observability/request-context";
import type { HealthCheck, HealthOptions } from "../observability/health";
import type {
  ErrorHandlerFunction,
  ErrorLogger,
  ExceptionFilterLike,
} from "../errors";

export type CorsOptions = {
  origin?:
    | boolean
    | string
    | RegExp
    | (string | RegExp)[]
    | ((
        origin: string,
        cb: (err: Error | null, allow?: boolean) => void,
      ) => void);
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
  preflight?: boolean;
  strictPreflight?: boolean;
  hideOptionsRoute?: boolean;
  optionsSuccessStatus?: number;
};

export type GlobalOptions = {
  cors?: CorsOptions;
  openApi?: OpenApiUiOptions;
  controllers?: any;
  middlewares?: any;
  authorization?: any;
  multipart?: any;
  staticFiles?: any;
};

export type MeghApplicationOptions = PluginOptions & {
  server?: FastifyServerOptions;
  /**
   * Request IDs: read from `x-request-id` when the client sends a safe one,
   * generated otherwise, echoed on the response and added to every log line.
   * `false` turns this off. `server.genReqId` overrides the generator.
   */
  requestId?: RequestIdOptions;
  /** Features that may change or be removed in a minor release. */
  experimental?: ExperimentalOptions;
};

export type ExperimentalOptions = {
  /**
   * Validate `@Body()` and `@Query()` DTOs with a validator compiled once per
   * class instead of calling class-transformer and class-validator on every
   * request. Errors and the handler's value are the same; DTOs the compiled
   * path can't reproduce exactly (nested DTOs, `@Type`, `@Transform`, async
   * constraints) keep using class-validator.
   *
   * Defaults to the `MEGH_COMPILED_VALIDATION` environment variable
   * (`true` or `1`), otherwise `false`.
   */
  compiledValidation?: boolean;
};

export type AutoControllerOptions = {
  auto: true;
  path?: string;
};

export type CacheOptions = {
  provider: "memory" | "redis";
  redisOptions?: RedisOptions;
};

/** Options for `app.run(port, options)`. */
export type RunOptions = {
  /** Interface to listen on. Defaults to `process.env.HOST`, else `0.0.0.0`. */
  host?: string;
  /** Called once the server is listening. */
  onListen?: CallableFunction;
  /**
   * Milliseconds to wait for a graceful shutdown on SIGTERM/SIGINT before
   * the process exits with code 1. Defaults to 10000.
   */
  shutdownTimeout?: number;
};

/** A function run at a stage of the application lifecycle. */
export type LifecycleHook = () => void | Promise<void>;

export interface IMeghApplication {
  // all use
  useCors: (options: CorsOptions) => this;
  useCache: (options?: CacheOptions) => this;
  useMultipart: (options?: any) => this;
  useOpenApi: (
    options?: OpenApiUiOptions | Constructor<MeghConfig<OpenApiUiOptions>>,
  ) => this;
  useMiddlewares: (middlewares: Constructor<MeghMiddleware>[]) => this;
  /** Register the global authentication handler that populates `request.user`. */
  useAuthentication: (authentication: Constructor<MeghAuthentication>) => this;
  useAuthorization: (authorization: Constructor<any>) => this;
  /** Register global exception filters, run in order before the default error response. */
  useExceptionFilters: (
    filters: ExceptionFilterLike | ExceptionFilterLike[],
  ) => this;
  /** Register a function that handles request errors (a catch-all filter). */
  useErrorHandler: (handler: ErrorHandlerFunction) => this;
  /** Replace or turn off (`false`) logging of default error responses. */
  useErrorLogger: (logger: ErrorLogger | false) => this;
  /** Serve `GET /health` and `GET /ready`. */
  useHealth: (options?: HealthOptions) => this;
  /** Add a readiness check reported by `GET /ready`. */
  addHealthCheck: (name: string, check: HealthCheck) => this;
  useControllers: (controllers: Constructor[] | AutoControllerOptions) => this;
  useStaticFiles: (options: any) => this;
  useGlobal: (options: GlobalOptions) => this;
  useSocketIo: (options?: any) => this;

  // all map
  mapGet: <T extends (...args: any[]) => any>(path: string, fn: T) => any;
  mapPost: <T extends (...args: any[]) => any>(path: string, fn: T) => any;
  mapPut: <T extends (...args: any[]) => any>(path: string, fn: T) => any;
  mapPatch: <T extends (...args: any[]) => any>(path: string, fn: T) => any;
  mapDelete: <T extends (...args: any[]) => any>(path: string, fn: T) => any;

  // lifecycle
  /** Run during `run()`, after the database connects and before the server listens. */
  onInit: (hook: LifecycleHook) => this;
  /** Run once the server is listening. */
  onReady: (hook: LifecycleHook) => this;
  /** Run on shutdown (`close()`, SIGTERM or SIGINT), in reverse registration order. */
  onClose: (hook: LifecycleHook) => this;
  /** Stop the server, scheduled tasks and workers, then run the `onClose` hooks. */
  close: () => Promise<void>;

  // run
  run: (
    port?: number,
    options?: RunOptions | CallableFunction,
  ) => Promise<void>;
}

export type TestResponse =
  LightMyRequestResponse | Promise<LightMyRequestResponse>;

export interface TestApplication {
  get: (url: string, options?: InjectOptions) => TestResponse;
  post: (url: string, options?: InjectOptions) => TestResponse;
  put: (url: string, options?: InjectOptions) => TestResponse;
  patch: (url: string, options?: InjectOptions) => TestResponse;
  delete: (url: string, options?: InjectOptions) => TestResponse;
  options: (url: string, options?: InjectOptions) => TestResponse;
  getController: <T>(controller: Constructor<T>, deps?: any[]) => T;
}

export type TestAppOptions = {
  controllers: Constructor[] | unknown[];
};
