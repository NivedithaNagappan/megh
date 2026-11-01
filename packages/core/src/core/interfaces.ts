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
};

export type AutoControllerOptions = {
  auto: true;
  path?: string;
};

export type CacheOptions = {
  provider: "memory" | "redis";
  redisOptions?: RedisOptions;
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
  useSerialization: () => this;
  useControllers: (controllers: Constructor[] | AutoControllerOptions) => this;
  useStaticFiles: (options: any) => this;
  useHttps: (options?: any) => this;
  useGlobal: (options: GlobalOptions) => this;
  useSocketIo: (options?: any) => this;

  mapFeatures: () => this;

  // all map
  mapGet: <T extends (...args: any[]) => any>(path: string, fn: T) => any;
  mapPost: <T extends (...args: any[]) => any>(path: string, fn: T) => any;
  mapPut: <T extends (...args: any[]) => any>(path: string, fn: T) => any;
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
  run: (port?: number, fn?: CallableFunction) => Promise<void>;
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
