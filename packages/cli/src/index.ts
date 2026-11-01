/**
 * Library entry for `@meghjs/cli`. Importing it has no side effects; the
 * executable lives in `bin.ts`.
 */
export { runCli, createProgram, normalizeArgv } from "./program";
export type { RunOptions } from "./program";
export { CliError } from "./errors";
export { createApplication } from "./commands/new";
export type { NewOptions } from "./commands/new";
export { build } from "./commands/build";
export { serve } from "./commands/serve";
export { start } from "./commands/start";
export { doctor, runChecks } from "./commands/doctor";
export { routeList, scanRoutes } from "./commands/route-list";
export {
  makeModel,
  makeController,
  makeService,
  makeConfig,
  makeMiddleware,
  makeDto,
} from "./generators/make";
export { resolveName, pascalCase, camelCase, kebabCase, snakeCase } from "./utils/names";
export { findProjectRoot } from "./utils/project";
