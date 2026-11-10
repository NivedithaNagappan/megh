/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */

/** Extra settings for an HTTP exception. */
export interface HttpExceptionOptions {
  /** The underlying error, kept for logs (`error.cause`). Never sent to clients. */
  cause?: unknown;
  /** Response headers to set, such as `Retry-After` or `WWW-Authenticate`. */
  headers?: Record<string, string | number | string[]>;
}

/**
 * Base class for errors that map to an HTTP response.
 *
 * `message` may be a string or an object. An object is sent as `data` and
 * stringified into `error.message`.
 */
export abstract class BaseHttpException extends Error {
  code: number = 500;
  name: string = "HttpException";
  payload: any;
  headers?: Record<string, string | number | string[]>;

  constructor(message: any, options?: HttpExceptionOptions) {
    const stringMessage =
      typeof message === "string" ? message : JSON.stringify(message);
    super(
      stringMessage,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.payload = typeof message === "string" ? { message } : message;
    if (options?.headers) this.headers = options.headers;
  }

  /** The HTTP status. Same as `code`; this name is what Fastify and most libraries read. */
  get statusCode(): number {
    return this.code;
  }

  isCustomException() {
    return true;
  }
}

/**
 * An HTTP exception with any status code, for statuses without a dedicated
 * class.
 *
 *   throw new HttpException(402, "Payment required");
 */
export class HttpException extends BaseHttpException {
  constructor(
    status: number,
    message: any = "",
    options?: HttpExceptionOptions,
  ) {
    super(message, options);
    this.code = status;
  }
}

/**
 * Declares a subclass with a fixed status and name. The class fields of each
 * subclass run after `BaseHttpException`'s, so the status set here wins.
 */
function defineStatus(name: string, code: number, defaultMessage = "") {
  return class extends BaseHttpException {
    name: string = name;
    code: number = code;
    constructor(message: any = defaultMessage, options?: HttpExceptionOptions) {
      super(message, options);
    }
  };
}

// ─── 4xx ─────────────────────────────────────────────────────────────────────

export class BadRequestException extends defineStatus("BadRequest", 400) {}

/**
 * A request that failed validation (400).
 *
 * Pass the individual issues as `errors` to have them sent in the response's
 * `errors` field.
 */
export class ValidationErrorException extends BadRequestException {
  name: string = "ValidationError";
  errors?: unknown[];

  constructor(
    message: any = "Validation failed",
    errors?: unknown[],
    options?: HttpExceptionOptions,
  ) {
    super(message, options);
    if (errors) this.errors = errors;
  }
}

export class UnauthorizedException extends defineStatus("Unauthorized", 401) {}
export class ForbiddenException extends defineStatus("Forbidden", 403) {}
export class NotFoundException extends defineStatus("NotFound", 404) {}
export class MethodNotAllowedException extends defineStatus(
  "MethodNotAllowed",
  405,
) {}
export class NotAcceptableException extends defineStatus(
  "NotAcceptable",
  406,
) {}
export class RequestTimeoutException extends defineStatus(
  "RequestTimeout",
  408,
) {}
export class ConflictException extends defineStatus("Conflict", 409) {}
export class GoneException extends defineStatus("Gone", 410) {}
export class PayloadTooLargeException extends defineStatus(
  "PayloadTooLarge",
  413,
) {}
export class UnsupportedMediaTypeException extends defineStatus(
  "UnsupportedMediaType",
  415,
) {}
export class UnprocessableEntityException extends defineStatus(
  "UnprocessableEntity",
  422,
) {}
export class TooManyRequestsException extends defineStatus(
  "TooManyRequests",
  429,
) {}

// ─── 5xx ─────────────────────────────────────────────────────────────────────

export class InternalErrorException extends defineStatus(
  "InternalError",
  500,
  "Something going wrong",
) {}
export class NotImplementedException extends defineStatus(
  "NotImplemented",
  501,
) {}
export class BadGatewayException extends defineStatus("BadGateway", 502) {}
export class ServiceUnavailableException extends defineStatus(
  "ServiceUnavailable",
  503,
) {}
export class GatewayTimeoutException extends defineStatus(
  "GatewayTimeout",
  504,
) {}

export type HttpExceptionTypes =
  | NotFoundException
  | BadRequestException
  | UnauthorizedException
  | InternalErrorException
  | ForbiddenException;

/** Factory shortcuts: `throw HttpExceptions.notFound("User not found")`. */
export const HttpExceptions = {
  badRequest: (message: any = "", options?: HttpExceptionOptions) =>
    new BadRequestException(message, options),
  validationError: (message: any = "", errors?: unknown[]) =>
    new ValidationErrorException(message, errors),
  unauthorized: (message: any = "", options?: HttpExceptionOptions) =>
    new UnauthorizedException(message, options),
  forbidden: (message: any = "", options?: HttpExceptionOptions) =>
    new ForbiddenException(message, options),
  notFound: (message: any = "", options?: HttpExceptionOptions) =>
    new NotFoundException(message, options),
  methodNotAllowed: (message: any = "", options?: HttpExceptionOptions) =>
    new MethodNotAllowedException(message, options),
  conflict: (message: any = "", options?: HttpExceptionOptions) =>
    new ConflictException(message, options),
  gone: (message: any = "", options?: HttpExceptionOptions) =>
    new GoneException(message, options),
  payloadTooLarge: (message: any = "", options?: HttpExceptionOptions) =>
    new PayloadTooLargeException(message, options),
  unsupportedMediaType: (message: any = "", options?: HttpExceptionOptions) =>
    new UnsupportedMediaTypeException(message, options),
  unprocessableEntity: (message: any = "", options?: HttpExceptionOptions) =>
    new UnprocessableEntityException(message, options),
  tooManyRequests: (message: any = "", options?: HttpExceptionOptions) =>
    new TooManyRequestsException(message, options),
  internalError: (message: any = "", options?: HttpExceptionOptions) =>
    new InternalErrorException(message, options),
  notImplemented: (message: any = "", options?: HttpExceptionOptions) =>
    new NotImplementedException(message, options),
  serviceUnavailable: (message: any = "", options?: HttpExceptionOptions) =>
    new ServiceUnavailableException(message, options),
  /** Any status: `HttpExceptions.status(402, "Payment required")`. */
  status: (status: number, message: any = "", options?: HttpExceptionOptions) =>
    new HttpException(status, message, options),
};
