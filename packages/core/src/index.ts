/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import "reflect-metadata";
import * as sw from "./openapi/swagger-schema";

// ─── Core ────────────────────────────────────────────────────────────────────
export * from "./core/application";
export * from "./core/interfaces";
export * from "./core/types";
export * from "./core/testing";

// ─── HTTP ────────────────────────────────────────────────────────────────────
export * from "./http";

// ─── Validation (class-validator / class-transformer compatible) ─────────────
export * from "./validator";

// ─── OpenAPI ─────────────────────────────────────────────────────────────────
export * from "./openapi";

// ─── Collections and pagination ──────────────────────────────────────────────
export * from "./collection";

// ─── ORM ─────────────────────────────────────────────────────────────────────
export * from "./orm";

// ─── Config ──────────────────────────────────────────────────────────────────
export * from "./config";

// ─── Events ──────────────────────────────────────────────────────────────────
export * from "./events";

// ─── Queue ───────────────────────────────────────────────────────────────────
export * from "./queue";
// `export *` does not forward type-only re-exports, so surface the BullMQ job
// types explicitly for consumers writing handler signatures.
export type { Job, JobsOptions } from "./queue/queue";

// ─── Mail ────────────────────────────────────────────────────────────────────
export * from "./mail";

// ─── Scheduler ───────────────────────────────────────────────────────────────
export * from "./scheduler/schedule-decorator";
export { MeghScheduler } from "./scheduler/scheduler";

// ─── Security ────────────────────────────────────────────────────────────────
export * from "./security";

// ─── Storage / Realtime / Observability ──────────────────────────────────────
export * from "./storage";
export * from "./realtime";
export * from "./observability";

// ─── Errors ─────────────────────────────────────────────────────────────────
export * from "./errors";

// ─── Common ──────────────────────────────────────────────────────────────────
export * from "./common/decorators";
export * from "./common/helpers";
export * from "./common/container";

// ─── Convenience aliases ─────────────────────────────────────────────────────
export const GetSchema = sw.generateSwaggerSchema;
export const OpenApiOk = (args1: any) => {
  return sw.OpenApiResponse(200, args1, "Success");
};
export const OpenApiResponse = sw.OpenApiResponse;
export const OpenApiProperty = sw.OpenApiProperty;

// ─── Plugins ──────────────────────────────────────────────────────────────────
export * from "./plugins";

// ─── Dependency injection ────────────────────────────────────────────────────
export {
  Container as MeghContainer,
  ContainerError,
  Token,
  Injectable,
  createInjectDecorator,
  inject,
} from "./di";
export type {
  ContainerApi,
  Constructable,
  InjectOptions,
  ServiceIdentifier,
} from "./di";
