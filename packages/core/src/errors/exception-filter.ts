/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import "reflect-metadata";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Injectable } from "../di";

/** The status, headers and body Megh sends for an error. */
export interface ErrorResponse {
  statusCode: number;
  headers?: Record<string, string | number | string[]>;
  body: ErrorResponseBody;
}

/** The default JSON error body. */
export interface ErrorResponseBody {
  code: number;
  status: "Error";
  message: string;
  /** The exception's payload. Sent for 4xx, and for 5xx in development only. */
  data?: unknown;
  /** Individual validation issues. */
  errors?: unknown;
  /** Error class name. Development only. */
  error?: string;
  /** First stack frames. Development only. */
  stack?: string[];
  [key: string]: unknown;
}

/** What a filter gets besides the error. */
export interface ErrorContext {
  request: FastifyRequest;
  reply: FastifyReply;
  /** True when `NODE_ENV` is `"development"`. */
  isDevelopment: boolean;
  /**
   * What Megh sends if no filter handles the error. Build on it to keep the
   * status and the production redaction, or ignore it.
   */
  response: ErrorResponse;
}

/**
 * Handles errors thrown while serving a request.
 *
 * What `catch` does decides what happens next:
 *
 * - Return a value: it becomes the response body. The status is
 *   `ctx.response.statusCode` unless the filter calls `ctx.reply.code()`.
 * - Return an `Error` (an `HttpException`, say): the error is replaced and
 *   handling continues with the next filter, then the default response. Use
 *   this to map domain errors to HTTP ones.
 * - Send the reply itself (`ctx.reply.send(...)`): nothing else runs.
 * - Return `undefined` without sending: the next filter runs. Use this for
 *   filters that only report errors.
 *
 * A filter class is resolved through the DI container, so its constructor
 * can take services. Limit it to some error types with {@link Catch}.
 */
export interface ExceptionFilter<E = any> {
  catch(error: E, ctx: ErrorContext): unknown | Promise<unknown>;
}

/** A function filter, with the same contract as {@link ExceptionFilter.catch}. */
export type ErrorHandlerFunction<E = any> = (
  error: E,
  ctx: ErrorContext,
) => unknown | Promise<unknown>;

/** Anything accepted where a filter is expected. */
export type ExceptionFilterLike =
  | (new (...args: any[]) => ExceptionFilter)
  | ExceptionFilter
  | ErrorHandlerFunction;

type ErrorClass = abstract new (...args: any[]) => unknown;

export const CATCH_META_KEY = "megh:exception-filter:catch";
export const FILTERS_META_KEY = "megh:exception-filter:filters";

/**
 * Restrict an exception filter to errors of the given classes (subclasses
 * included). Without `@Catch`, or with `@Catch()`, the filter sees every
 * error.
 *
 *   @Catch(EntityNotFoundError)
 *   class EntityNotFoundFilter implements ExceptionFilter<EntityNotFoundError> {
 *     catch(error: EntityNotFoundError) {
 *       return new NotFoundException(error.message);
 *     }
 *   }
 *
 * The class is also registered with the DI container.
 */
export function Catch(...types: ErrorClass[]): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(CATCH_META_KEY, types, target);
    Injectable()(target);
  };
}

/**
 * Apply exception filters to every route of a controller, or to one route.
 * They run before the global filters: route filters first, then controller
 * filters.
 *
 *   @UseFilters(PaymentErrorFilter)
 *   @ApiController("/payments")
 *   class PaymentsController {}
 */
export function UseFilters(
  ...filters: ExceptionFilterLike[]
): ClassDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    const existing: ExceptionFilterLike[] =
      (propertyKey === undefined
        ? Reflect.getMetadata(FILTERS_META_KEY, target)
        : Reflect.getMetadata(FILTERS_META_KEY, target, propertyKey)) ?? [];
    const next = [...existing, ...filters];
    if (propertyKey === undefined) {
      Reflect.defineMetadata(FILTERS_META_KEY, next, target);
    } else {
      Reflect.defineMetadata(FILTERS_META_KEY, next, target, propertyKey);
    }
  };
}

/** Filters declared with {@link UseFilters}: route ones first, then the controller's. */
export function getDeclaredFilters(
  controller: Function,
  method: string,
): ExceptionFilterLike[] {
  return [
    ...(Reflect.getMetadata(FILTERS_META_KEY, controller.prototype, method) ??
      []),
    ...(Reflect.getMetadata(FILTERS_META_KEY, controller) ?? []),
  ];
}
