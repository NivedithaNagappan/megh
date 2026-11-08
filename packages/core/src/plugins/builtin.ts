/**
 * Plugins that ship inside @meghjs/core until they move to their own
 * packages. An installed package with the same name replaces the built-in
 * one, so publishing `@meghjs/orm` takes over without changes to core; once
 * it's published, its line here is removed.
 */
import { ormPlugin } from "../orm/plugin";
import type { MeghPlugin } from "./plugin";

export const BUILTIN_PLUGINS: readonly MeghPlugin[] = [ormPlugin];
