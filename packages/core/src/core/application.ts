/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import Fastify, { FastifyInstance, HTTPMethods } from "fastify";
import path from "path";
import fs from "fs";
import { MeghRouter } from "./router";
import { Container } from "../di";
import {
  IMeghApplication,
  MeghApplicationOptions,
  CorsOptions,
  GlobalOptions,
  CacheOptions,
  LifecycleHook,
} from "./interfaces";
import { BaseHttpException } from "../common/exceptions";
import { SystemUseError } from "../common/exceptions/system-exception";
import { Constructor, loadPackageFromClient } from "../common/helpers";
import { generateSwaggerSchema } from "../openapi/swagger-schema";
import { applyRequestBodyExtensions } from "../openapi/request-body";
import { swaggerUiBranding } from "../openapi/branding";
import { OpenApiUiOptions } from "../openapi/openapi";
import { MeghMiddleware } from "../http/middleware";
import { MeghScheduler } from "../scheduler";
import { isApiController } from "../common/container";
import { AutoControllerOptions, IResponse, TestApplication } from "./types";

import type { RedisOptions } from "ioredis";
import { CacheManager } from "../observability/cache";
import { MeghConfig } from "../config/config";
import { MeghAuthentication } from "../security/authentication";
import { registerPlugins } from "../plugins/registry";
import { internalLogger } from "../observability/internal-logger";
// ---------------------------------------------------------------------------
// Lazy loaders for optional peer dependencies
// ---------------------------------------------------------------------------

function requireSocketIo() {
  try {
    return require("fastify-socket.io");
  } catch {
    throw new Error(
      "[Megh] fastify-socket.io is not installed.\n" +
        "Run: npm install fastify-socket.io socket.io",
    );
  }
}

function requireSwagger() {
  try {
    return require("@fastify/swagger");
  } catch {
    throw new Error(
      "[Megh] @fastify/swagger is not installed.\n" +
        "Run: npm install @fastify/swagger @fastify/swagger-ui",
    );
  }
}

function requireSwaggerUi() {
  try {
    return require("@fastify/swagger-ui");
  } catch {
    throw new Error(
      "[Megh] @fastify/swagger-ui is not installed.\n" +
        "Run: npm install @fastify/swagger-ui",
    );
  }
}

function requireScalar() {
  try {
    return require("@scalar/fastify-api-reference");
  } catch {
    throw new Error(
      "[Megh] @scalar/fastify-api-reference is not installed.\n" +
        "Run: npm install @scalar/fastify-api-reference",
    );
  }
}

function requireCors() {
  try {
    return require("@fastify/cors");
  } catch {
    throw new Error(
      "[Megh] @fastify/cors is not installed.\n" +
        "Run: npm install @fastify/cors",
    );
  }
}

function requireMultipart() {
  try {
    return require("@fastify/multipart");
  } catch {
    throw new Error(
      "[Megh] @fastify/multipart is not installed.\n" +
        "Run: npm install @fastify/multipart",
    );
  }
}

function requireStatic() {
  try {
    return require("@fastify/static");
  } catch {
    throw new Error(
      "[Megh] @fastify/static is not installed.\n" +
        "Run: npm install @fastify/static",
    );
  }
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export class MeghApplication implements IMeghApplication {
  public app: FastifyInstance;
  private router: MeghRouter;
  private static instance: MeghApplication;
  private alreadyRun = false;
  private hasSwagger = false;
  private globalSwaggerOptions: OpenApiUiOptions | undefined;
  private isMapFeatures = false;
  private registerControllerAuto = false;
  private registerControllerPath = "src/controllers";
  private controllers: any[] = [];
  private _hasWebsocket = false;
  private io: any;
  private scheduler: MeghScheduler = new MeghScheduler();
  private schedulerTasks: any[] = [];
  private registerSchedulerAuto = false;
  private registerSchedulerPath = "src/tasks";
  private _workers: any[] = [];
  private lifecycleHooks: Record<"init" | "ready" | "close", LifecycleHook[]> =
    {
      init: [],
      ready: [],
      close: [],
    };
  private closing: Promise<void> | null = null;
  private pluginNames: string[] = [];

  private constructor(options?: MeghApplicationOptions) {
    this.app = Fastify({
      ...options?.server,
      ajv: {
        customOptions: {
          strict: false,
          ...options?.server?.ajv?.customOptions,
        },
      },
    }) as FastifyInstance;
    this.router = new MeghRouter(this.app);

    this.pluginNames = registerPlugins(this, options);
    if (this.pluginNames.length) {
      internalLogger("plugins").info(
        { plugins: this.pluginNames },
        "Plugins registered",
      );
    }
  }

  /** Names of the registered plugins, in registration order. */
  getPlugins(): readonly string[] {
    return this.pluginNames;
  }

  public static getApp(options?: MeghApplicationOptions) {
    if (!MeghApplication.instance) {
      MeghApplication.instance = new MeghApplication(options);
    }
    return MeghApplication.instance;
  }

  /** @deprecated Use `getApp` instead. This is internal. */
  public static getInternalApp(options?: MeghApplicationOptions) {
    return new MeghApplication(options);
  }

  // ── Feature methods ──────────────────────────────────────────────────────

  useCors(options: CorsOptions) {
    this.app.register(requireCors(), options); // ✅ lazy
    return this;
  }

  useCache(options?: CacheOptions) {
    CacheManager.configure(options);

    if (!Container.has(CacheManager)) {
      Container.set(CacheManager, new CacheManager());
    }
    return this;
  }

  useMultipart(options?: any) {
    this.app.register(requireMultipart(), {
      // ✅ lazy
      attachFieldsToBody: true,
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      ...options,
    });
    return this;
  }

  useOpenApi(
    options?: OpenApiUiOptions | Constructor<MeghConfig<OpenApiUiOptions>>,
  ) {
    this.hasSwagger = true;
    if (
      typeof options === "function" &&
      options.prototype != null &&
      typeof options.prototype.config === "function"
    ) {
      const { GetConfig } = require("../config/config");
      this.globalSwaggerOptions = GetConfig(options);
    } else {
      this.globalSwaggerOptions = options as OpenApiUiOptions;
    }

    return this;
  }

  private async initSwagger(options?: OpenApiUiOptions) {
    const safeControllers = (this.controllers ?? []).filter(
      (c) => c != null && typeof c === "function",
    );
    const baseSchema = generateSwaggerSchema(safeControllers);

    await this.app.register(requireSwagger(), {
      // ✅ lazy
      openapi: {
        ...baseSchema,
        info: options?.info || { title: "API", version: "1.0.0" },
        servers: options?.servers,
        tags: options?.tags,
        components: {
          ...baseSchema?.components,
          ...options?.components,
          schemas: {
            ...baseSchema?.components?.schemas,
            ...options?.components?.schemas,
          },
        },
        security: options?.security,
        externalDocs: options?.externalDocs,
      },
      transformObject: ({ openapiObject }: { openapiObject: any }) =>
        applyRequestBodyExtensions(openapiObject),
    });

    const routePrefix = options?.routePrefix || "/swagger";

    if (options?.provider === "scalar") {
      await this.app.register(requireScalar(), {
        // ✅ lazy
        routePrefix,
        configuration: {
          spec: {
            content: () => requireSwagger(),
          },
          ...options?.uiConfig,
        },
      });
    } else {
      await this.app.register(requireSwaggerUi(), {
        // ✅ lazy
        routePrefix,
        ...swaggerUiBranding({ logo: options?.logo, theme: options?.theme }),
        uiConfig: {
          docExpansion: "full",
          deepLinking: false,
          ...options?.uiConfig,
        },
        uiHooks: {
          onRequest: function (request: any, reply: any, next: any) {
            next();
          },
          preHandler: function (request: any, reply: any, next: any) {
            next();
          },
        },
        staticCSP: true,
        transformSpecificationClone: true,
      });
    }
  }

  useMiddlewares(middlewares: Constructor<MeghMiddleware>[]) {
    middlewares.forEach((m) => {
      const cls = Container.get<MeghMiddleware>(m);
      this.app.addHook("preHandler", async (req, res) => {
        await cls.invoke(req as any, res as IResponse);
      });
    });
    return this;
  }

  /**
   * Register the global authentication handler.
   *
   * The handler runs once per request, before any authorization handler, and
   * whatever its `authenticate` method returns becomes `request.user` — the
   * value injected by `@AuthUser()`.
   *
   *   app.useAuthentication(JwtAuthentication)
   *
   * @see MeghAuthentication
   */
  useAuthentication(authentication: Constructor<MeghAuthentication>) {
    if (typeof authentication !== "function") {
      throw new SystemUseError(
        "[Megh] useAuthentication expects an authentication class, e.g. app.useAuthentication(JwtAuthentication).",
      );
    }
    this.router.setAuthenticationHandler(authentication);
    return this;
  }

  /**
   * Register one or more authorization handlers.
   *
   * Single handler:
   *   app.useAuthorization(JwtAuthorization)
   *
   * Named map (multi-strategy):
   *   app.useAuthorization({ jwt: JwtAuthorization, oauth: OAuthV2 })
   *
   * Then in controllers:
   *   @Authorized()                    // uses the first/default handler
   *   @Authorized("jwt")               // uses the "jwt" handler
   *   @Authorized({ name: "oauth" })   // uses the "oauth" handler
   */
  useAuthorization(
    authorization: Constructor<any> | Record<string, Constructor<any>>,
  ) {
    if (typeof authorization === "function") {
      this.router.setAuthorizeMiddleware(authorization);
    } else {
      this.router.setAuthorizeMiddlewareMap(authorization);
    }
    return this;
  }

  useSerialization() {
    return this;
  }

  /**
   * Register scheduled task classes.
   *
   * Explicit list:
   *   app.useScheduler([ReportTask, CleanupTask])
   *
   * Auto-scan a directory (mirrors useControllers):
   *   app.useScheduler({ path: "src/tasks" })
   */
  useScheduler(tasks: Constructor[] | { path: string }) {
    if (Array.isArray(tasks)) {
      this.schedulerTasks = tasks;
      this.scheduler.addTaskClasses(tasks);
    } else {
      this.registerSchedulerAuto = true;
      if (tasks.path) this.registerSchedulerPath = tasks.path;
    }
    return this;
  }

  useControllers(controllers: Constructor[] | AutoControllerOptions) {
    if (Array.isArray(controllers)) {
      this.controllers = controllers;
      controllers.forEach((controller) => {
        if (!this.controllers.includes(controller)) {
          this.controllers.push(controller);
        }
      });
    } else {
      this.registerControllerAuto = true;
      if (controllers.path) {
        this.registerControllerPath = controllers.path;
      }
    }
    return this;
  }

  useStaticFiles(options?: any) {
    this.app.register(requireStatic(), options); // ✅ lazy
    return this;
  }

  useHttps(options?: any) {
    return this;
  }

  useGlobal(options: GlobalOptions) {
    if (options.cors) this.useCors(options.cors);
    if (options.openApi) this.useOpenApi(options.openApi);
    if (options.controllers) this.useControllers(options.controllers);
    if (options.middlewares) this.useMiddlewares(options.middlewares);
    if (options.authorization) this.useAuthorization(options.authorization);
    if (options.multipart) this.useMultipart(options.multipart);
    if (options.staticFiles) this.useStaticFiles(options.staticFiles);
    if ((options as any).scheduler)
      this.useScheduler((options as any).scheduler);
    return this;
  }

  useSocketIo(options?: any) {
    this._hasWebsocket = true;
    this.app.register(requireSocketIo(), options); // ✅ lazy
    return this;
  }

  /**
   * Register queue workers.
   *
   * Resolving each class through the container is what starts it: `@Queue`
   * boots its worker in the constructor, and `@MeghWorker` starts on
   * resolution unless `autoStart: false` was set.
   *
   *   app.useWorker([EmailQueue, ReportWorker])
   *
   * Workers are closed automatically when the application shuts down.
   */
  useWorker(workers: Constructor<any>[]) {
    if (!Array.isArray(workers)) {
      throw new SystemUseError(
        "[Megh] useWorker expects an array of queue or worker classes, e.g. app.useWorker([EmailQueue]).",
      );
    }

    for (const worker of workers) {
      const instance = Container.get(worker) as any;
      // @MeghWorker({ autoStart: false }) defers starting until now.
      if (typeof instance?.start === "function" && !instance.getWorker?.()) {
        instance.start();
      }
      this._workers.push(instance);
    }

    return this;
  }

  /** Close every registered worker, releasing their Redis connections. */
  private async _closeWorkers() {
    await Promise.all(
      this._workers.map(async (w) => {
        try {
          await w?.close?.();
        } catch (err) {
          console.error("[Megh] Failed to close worker:", err);
        }
      }),
    );
    this._workers = [];
  }

  mapFeatures() {
    this.isMapFeatures = true;
    return this;
  }

  /**
   * True only when `NODE_ENV` is exactly `"development"`. An unset
   * `NODE_ENV` counts as production, so dev-only features (API docs,
   * detailed errors) stay off unless explicitly enabled.
   */
  isDevelopment() {
    return process.env.NODE_ENV === "development";
  }

  private async _mapControllers() {
    const safeControllers = (this.controllers ?? []).filter(
      (c) => c != null && typeof c === "function",
    );
    if (safeControllers.length > 0) {
      for (const controller of safeControllers) {
        if (isApiController(controller)) {
          await this.router.buildController(controller);
        } else {
          throw new SystemUseError("Not an API controller.");
        }
      }
    }
  }

  private _resolveControllerDir(dir?: string) {
    const isTsNode =
      process.env.TS_NODE_DEV ||
      process.env.TS_NODE_PROJECT ||
      (process as any)[Symbol.for("ts-node.register.instance")];
    const controllerDir = path.join(process.cwd(), this.registerControllerPath);
    return isTsNode ? controllerDir : controllerDir.replace("src", "dist");
  }

  private async autoControllers(controllersPath?: string) {
    const conDir = this._resolveControllerDir(controllersPath);
    const isTsNode =
      process.env.TS_NODE_DEV ||
      process.env.TS_NODE_PROJECT ||
      (process as any)[Symbol.for("ts-node.register.instance")];

    try {
      const files = fs.readdirSync(conDir, {
        recursive: true,
        encoding: "utf-8",
      }) as string[];

      for (const file of files) {
        const isTestFile = /\.(test|spec|e2e-spec)\.(ts|js)$/.test(file);
        if (isTestFile) continue;
        if (isTsNode ? file.endsWith(".ts") : file.endsWith(".js")) {
          const filePath = path.join(conDir, file);
          const module = await import(filePath);
          for (const exported of Object.values(module)) {
            if (typeof exported === "function" && isApiController(exported)) {
              if (!this.controllers.some((con) => exported.name === con.name)) {
                this.controllers.push(exported);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not auto-register controllers from " + conDir, e);
    }
  }

  private _mapFeatures() {
    try {
      Container.get("features");
    } catch {
      // features token not registered — safe to ignore
    }
  }

  private handleSocket(socket: any) {
    // ✅ lazy — only resolve socket services when socket actually connects
    try {
      const { SocketContextService } = require("../events/socket-dispatcher");
      const { EventSubscriberRegistry } = require("../events/event-subscriber");
      const { SocketIoServer } = require("../realtime/websocket");

      const contextService = Container.get(SocketContextService) as any;
      const subscriberRegistry = Container.get(EventSubscriberRegistry) as any;

      subscriberRegistry.register(socket);

      const originalOn = socket.on.bind(socket);
      socket.on = (event: string, handler: Function) => {
        return originalOn(event, (...args: any[]) => {
          contextService.run(socket, () => handler(...args));
        });
      };
    } catch (e) {
      console.warn("[Megh] Socket handler error:", e);
    }
  }

  // ── Functional routing proxies ───────────────────────────────────────────

  mapGet<T extends (...args: any[]) => any>(path: string = "", fn: T) {
    return this.router.mapGet(path, fn);
  }
  mapPost<T extends (...args: any[]) => any>(path: string = "", fn: T) {
    return this.router.mapPost(path, fn);
  }
  mapPut<T extends (...args: any[]) => any>(path: string = "", fn: T) {
    return this.router.mapPut(path, fn);
  }
  mapDelete<T extends (...args: any[]) => any>(path: string = "", fn: T) {
    return this.router.mapDelete(path, fn);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Run `hook` during `run()`, after the database connects and before routes
   * are mapped and the server listens. A rejected hook aborts startup.
   */
  onInit(hook: LifecycleHook) {
    this.assertNotStarted("onInit");
    this.lifecycleHooks.init.push(hook);
    return this;
  }

  /** Run `hook` once the server is listening. */
  onReady(hook: LifecycleHook) {
    this.assertNotStarted("onReady");
    this.lifecycleHooks.ready.push(hook);
    return this;
  }

  /**
   * Run `hook` when the app shuts down: on `close()`, SIGTERM or SIGINT.
   * Close hooks run in reverse registration order, after the server has
   * stopped accepting requests. A failing hook is logged and the rest still run.
   */
  onClose(hook: LifecycleHook) {
    this.lifecycleHooks.close.push(hook);
    return this;
  }

  /**
   * Shut the app down: stop the HTTP server (waiting for in-flight requests),
   * stop scheduled tasks and queue workers, then run the `onClose` hooks.
   * Calling it again returns the same shutdown.
   */
  close(): Promise<void> {
    this.closing ??= this._close();
    return this.closing;
  }

  private async _close() {
    await this.app.close();
    this.scheduler.stopAll();
    await this._closeWorkers();
    for (const hook of [...this.lifecycleHooks.close].reverse()) {
      try {
        await hook();
      } catch (err) {
        console.error("[Megh] onClose hook failed:", err);
      }
    }
  }

  private assertNotStarted(method: string) {
    if (this.alreadyRun) {
      throw new SystemUseError(`${method}() must be called before run()`);
    }
  }

  private async runHooks(hooks: LifecycleHook[]) {
    for (const hook of hooks) {
      await hook();
    }
  }

  // ── Run ──────────────────────────────────────────────────────────────────

  private async _autoSchedulerTasks(): Promise<void> {
    const isTsNode =
      process.env.TS_NODE_DEV ||
      process.env.TS_NODE_PROJECT ||
      (process as any)[Symbol.for("ts-node.register.instance")];
    const nodePath = require("path");
    const nodeFs = require("fs");
    const { isScheduledTask } = require("../schedule-registry");
    const dir = nodePath.join(process.cwd(), this.registerSchedulerPath);
    const resolvedDir = isTsNode ? dir : dir.replace("src", "dist");
    try {
      const files = nodeFs.readdirSync(resolvedDir, {
        recursive: true,
        encoding: "utf-8",
      }) as string[];
      for (const file of files) {
        const isTest = /\.(test|spec|e2e-spec)\.(ts|js)$/.test(file);
        if (isTest) continue;
        if (isTsNode ? file.endsWith(".ts") : file.endsWith(".js")) {
          const mod = await import(nodePath.join(resolvedDir, file));
          for (const exported of Object.values(mod)) {
            if (typeof exported === "function" && isScheduledTask(exported)) {
              if (
                !this.schedulerTasks.some(
                  (t) => t.name === (exported as any).name,
                )
              ) {
                this.schedulerTasks.push(exported);
                this.scheduler.addTaskClasses([exported as any]);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn(
        "[Megh] Could not auto-register tasks from " + resolvedDir,
        e,
      );
    }
  }

  async run(port: number = 4000, fn?: CallableFunction): Promise<void> {
    if (this.alreadyRun) throw new SystemUseError("App already running");
    this.alreadyRun = true;

    if (this.hasSwagger) {
      await this.initSwagger(this.globalSwaggerOptions);
    }

    await this.runHooks(this.lifecycleHooks.init);

    if (this.isMapFeatures) {
      this._mapFeatures();
    }

    if (this.registerControllerAuto) {
      await this.autoControllers();
    }

    await this._mapControllers();
    this.router.processFunctionalRoutes();

    // Start scheduler after DB is ready and controllers are mapped,
    // but before the HTTP server starts accepting traffic.
    if (this.registerSchedulerAuto) {
      await this._autoSchedulerTasks();
    }
    if (this.schedulerTasks.length > 0) {
      this.scheduler.start();
    }

    this.app.setErrorHandler((error: any, request, reply) => {
      const isDev = this.isDevelopment();
      const timestamp = new Date().toISOString();
      const requestInfo = `${request.method} ${request.url}`;

      // ✅ Handle Fastify AJV validation errors — these come with statusCode 400
      if ((error as any).statusCode === 400 || (error as any).validation) {
        console.warn(
          `[${timestamp}] HTTP 400 ${requestInfo} — ${error.message}`,
        );
        return reply.status(400).send({
          code: 400,
          status: "Error",
          message: error.message,
          errors: (error as any).validation ?? undefined,
        });
      }

      if (error instanceof BaseHttpException) {
        const code = error.code || 500;
        console.warn(
          `[${timestamp}] HTTP ${code} ${requestInfo} — ${error.message}`,
        );
        // 4xx messages are written for the client; 5xx ones describe server
        // internals and are only shown in development.
        const expose = isDev || code < 500;
        return reply
          .status(code)
          .type("application/json")
          .serializer((payload: any) => JSON.stringify(payload))
          .send({
            code,
            status: "Error",
            message: expose ? error.message : "Internal Server Error",
            ...(expose && { data: error.payload }),
          });
      }

      // Unexpected errors
      console.error(`\n❌ UNHANDLED ERROR @ ${timestamp}`);
      console.error(`   ${requestInfo}`);
      console.error(`   ${error.name}: ${error.message}`);
      if (error.stack) {
        console.error(
          `   Stack:\n${error.stack
            .split("\n")
            .slice(1)
            .map((l: any) => `      ${l.trim()}`)
            .join("\n")}`,
        );
      }
      if (isDev) {
        console.error("   Params:", JSON.stringify(request.params));
        console.error("   Query: ", JSON.stringify(request.query));
        console.error("   Body:  ", JSON.stringify(request.body));
      }
      console.error("");

      return reply.status(500).send({
        code: 500,
        status: "Error",
        message: isDev ? error.message : "Internal Server Error",
        ...(isDev && {
          error: error.name,
          stack: error.stack?.split("\n").slice(0, 5),
        }),
      });
    });

    await this.app.ready();

    if (this._hasWebsocket) {
      // @ts-ignore
      if (!this.app.io) {
        throw new Error(
          "Socket.IO not initialized. Make sure fastify-socket.io is registered correctly.",
        );
      }
      // ✅ lazy — resolve SocketIoServer token only when websocket is ready
      try {
        const { SocketIoServer } = require("../realtime/websocket");
        // @ts-ignore
        Container.set(SocketIoServer, this.app.io);
        // @ts-ignore
        await this.app.io.on("connection", this.handleSocket.bind(this));
      } catch (e) {
        console.warn("[Megh] WebSocket setup error:", e);
      }
    }

    const gracefulStop = async () => {
      await this.close();
      process.exit(0);
    };
    process.once("SIGTERM", gracefulStop);
    process.once("SIGINT", gracefulStop);

    await this.app.listen({ port });
    console.log(`Application running on http://127.0.0.1:${port}`);
    await this.runHooks(this.lifecycleHooks.ready);
    if (fn) fn();
  }
}
