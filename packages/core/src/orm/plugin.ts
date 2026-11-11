/**
 * The ORM as a Megh plugin. It ships inside `@meghjs/core` for now and is
 * registered as a built-in plugin; once it moves to `@meghjs/orm`, the
 * package's `"megh": { "plugin": … }` entry points here instead.
 */
import type { Kysely } from "kysely";
import {
  Environment,
  MeghConfig,
  definePlugin,
  type MeghConfigClass,
  type PluginContext,
} from "./core";
import {
  describeConnection,
  resolveDatabaseOptions,
  type DatabaseOptions,
} from "./config";
import { createDatabase, pingDatabase, verifyConnection } from "./connect";
import { setConnection } from "./connection";
import { setNamingStrategy } from "./naming";

function isConfigClass(value: unknown): value is MeghConfigClass {
  return typeof value === "function" && value.prototype instanceof MeghConfig;
}

function readEnv(ctx: PluginContext) {
  const env = ctx.container.get(Environment);
  return (key: string) => env.get<string | undefined>(key);
}

let warnedUseDatabase = false;

export const ormPlugin = definePlugin({
  name: "@meghjs/orm",
  register(ctx) {
    ctx.extend(
      "useMeghORM",
      (options?: DatabaseOptions | MeghConfigClass<DatabaseOptions>) => {
        const given = isConfigClass(options)
          ? ctx.container
              .get<MeghConfig<DatabaseOptions>>(options)
              .config(ctx.container.get(Environment))
          : options;
        const resolved = resolveDatabaseOptions(given, readEnv(ctx));
        if (resolved.naming) setNamingStrategy(resolved.naming);
        const db = createDatabase(resolved);
        setConnection(db);
        ctx.onInit(async () => {
          await verifyConnection(db, resolved);
          ctx.logger.info(`Connected to ${describeConnection(resolved)}`);
        });
        ctx.onClose(() => db.destroy());
        ctx.addHealthCheck("database", () => pingDatabase(db));
        return ctx.app;
      },
    );

    ctx.extend("useDatabase", (db: Kysely<any>) => {
      if (!warnedUseDatabase) {
        warnedUseDatabase = true;
        ctx.logger.warn(
          "app.useDatabase(kysely) is deprecated. Use app.useMeghORM({ dialect, url }); Megh creates the connection.",
        );
      }
      setConnection(db);
      ctx.onClose(() => db.destroy());
      ctx.addHealthCheck("database", () => pingDatabase(db));
      return ctx.app;
    });
  },
});

export default ormPlugin;
