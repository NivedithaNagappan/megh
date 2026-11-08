/**
 * Everything the ORM uses from Megh's core, in one place.
 *
 * The ORM is written as a plugin so it can move to its own package,
 * `@meghjs/orm`. Files in `orm/` import core only through this module (a lint
 * rule enforces it), so the move is: point these exports at "@meghjs/core"
 * and change the `declare module` path below.
 */
import type { DatabaseOptions } from "./config";
import type { MeghConfigClass } from "../config/config";
import type { Kysely } from "kysely";

export { Container, Token } from "../di";
export type { ContainerApi } from "../di";
export { BadRequestException, NotFoundException } from "../common/exceptions";
export { SystemUseError } from "../common/exceptions/system-exception";
export {
  normalizePageRequest,
  paginated,
  type PageRequest,
  type Paginated,
} from "../collection/pagination";
export { loadPackageFromClient } from "../common/utils/common-utils";
export { MeghConfig, type MeghConfigClass } from "../config/config";
export { Environment } from "../config/environment-variables";
export { definePlugin, type PluginContext } from "../plugins/plugin";

declare module "../core/application" {
  interface MeghApplication {
    /**
     * Connect Megh's ORM. Pass the connection settings, an `@AppConfig`
     * class that builds them, or nothing to read them from the environment
     * (`DATABASE_URL`, or `DB_DIALECT`, `DB_HOST`, `DB_PORT`, `DB_USER`,
     * `DB_PASSWORD`, `DB_NAME`).
     *
     * The connection is checked when the app starts and closed when it
     * shuts down.
     *
     * ```ts
     * app.useMeghORM({ dialect: "postgres", url: process.env.DATABASE_URL });
     * ```
     */
    useMeghORM(
      options?: DatabaseOptions | MeghConfigClass<DatabaseOptions>,
    ): this;
    /**
     * @deprecated Use `useMeghORM()`, which creates the connection for you.
     * Kept for apps that build their own Kysely instance.
     */
    useDatabase(db: Kysely<any>): this;
  }
}
export { registerSchemaProvider } from "../openapi/responses";
export type { SchemaClass, SchemaObject } from "../openapi/openapi";
