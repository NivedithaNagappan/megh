import type { FastifyInstance } from "fastify";
import type pino from "pino";
import type { MeghApplication } from "../core/application";
import type { LifecycleHook } from "../core/interfaces";
import type { ContainerApi } from "../di";
import { SystemUseError } from "../common/exceptions/system-exception";

/** What a plugin receives when it registers. */
export interface PluginContext {
  /** The application being set up. */
  app: MeghApplication;
  /** Core's dependency injection container. */
  container: ContainerApi;
  /** The underlying Fastify instance, for Fastify hooks and plugins. */
  http: FastifyInstance;
  /** A logger bound to this plugin's name. */
  logger: pino.Logger;
  /**
   * Add a method to the app, such as `app.useKnex`. Throws if core or another
   * plugin already defines the name. Declare the method for TypeScript with
   * `declare module "@meghjs/core" { interface MeghApplication { ... } }`.
   */
  extend(name: string, method: (...args: any[]) => unknown): void;
  /** Same as `app.onInit`: run during `run()`, before the server listens. */
  onInit(hook: LifecycleHook): void;
  /** Same as `app.onReady`: run once the server is listening. */
  onReady(hook: LifecycleHook): void;
  /** Same as `app.onClose`: run on shutdown, in reverse registration order. */
  onClose(hook: LifecycleHook): void;
}

export interface MeghPlugin {
  /** Unique name, normally the plugin's npm package name. */
  name: string;
  /** Names of plugins that must register before this one. */
  dependsOn?: string[];
  /**
   * Called once, when the app is created. It must be synchronous so the
   * methods it adds exist as soon as `createApplication()` returns; do async
   * work such as connecting to a database in `ctx.onInit`.
   */
  register(ctx: PluginContext): void;
}

/** Identity helper that type-checks a plugin definition. */
export function definePlugin(plugin: MeghPlugin): MeghPlugin {
  return plugin;
}

export function assertPlugin(
  value: unknown,
  source: string,
): asserts value is MeghPlugin {
  const plugin = value as Partial<MeghPlugin> | undefined;
  if (
    !plugin ||
    typeof plugin.name !== "string" ||
    plugin.name === "" ||
    typeof plugin.register !== "function"
  ) {
    throw new SystemUseError(
      `${source} is not a valid Megh plugin: expected an object with a name and a register(ctx) function`,
    );
  }
}
