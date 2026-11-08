/**
 * Kysely, the engine under the ORM, loaded on first use. Kysely is ES
 * modules only, and core loads the ORM plugin in every app: loading Kysely
 * eagerly would make apps that never touch the database depend on
 * `require()` of ES modules (Node.js 22.12+).
 */
import type * as KyselyModule from "kysely";

let loaded: typeof KyselyModule | undefined;

export function kysely(): typeof KyselyModule {
  return (loaded ??= require("kysely") as typeof KyselyModule);
}
