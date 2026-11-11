---
title: Error Handling
description: HTTP exceptions, the default error response, and custom exception filters.
---

# Error Handling

Throw an exception anywhere in a request (a controller, a service, a middleware
or an authorizer) and Megh turns it into a JSON response.

```ts
import { ApiController, Get, Param, NotFoundException } from '@meghjs/core';

@ApiController('/users')
export class UsersController {
  @Get('/:id')
  async findOne(@Param('id') id: number) {
    const user = await this.users.findByPk(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
```

```json
{ "code": 404, "status": "Error", "message": "User not found", "data": { "message": "User not found" } }
```

## HTTP exceptions

| Class                           | Status | Factory                               |
| ------------------------------- | ------ | ------------------------------------- |
| `BadRequestException`           | 400    | `HttpExceptions.badRequest()`         |
| `ValidationErrorException`      | 400    | `HttpExceptions.validationError()`    |
| `UnauthorizedException`         | 401    | `HttpExceptions.unauthorized()`       |
| `ForbiddenException`            | 403    | `HttpExceptions.forbidden()`          |
| `NotFoundException`             | 404    | `HttpExceptions.notFound()`           |
| `MethodNotAllowedException`     | 405    | `HttpExceptions.methodNotAllowed()`   |
| `NotAcceptableException`        | 406    |                                       |
| `RequestTimeoutException`       | 408    |                                       |
| `ConflictException`             | 409    | `HttpExceptions.conflict()`           |
| `GoneException`                 | 410    | `HttpExceptions.gone()`               |
| `PayloadTooLargeException`      | 413    | `HttpExceptions.payloadTooLarge()`    |
| `UnsupportedMediaTypeException` | 415    | `HttpExceptions.unsupportedMediaType()` |
| `UnprocessableEntityException`  | 422    | `HttpExceptions.unprocessableEntity()` |
| `TooManyRequestsException`      | 429    | `HttpExceptions.tooManyRequests()`    |
| `InternalErrorException`        | 500    | `HttpExceptions.internalError()`      |
| `NotImplementedException`       | 501    | `HttpExceptions.notImplemented()`     |
| `BadGatewayException`           | 502    |                                       |
| `ServiceUnavailableException`   | 503    | `HttpExceptions.serviceUnavailable()` |
| `GatewayTimeoutException`       | 504    |                                       |
| `HttpException`                 | any    | `HttpExceptions.status(code, msg)`    |

The message can be a string or an object; an object is sent as `data`. The
second argument sets response headers and keeps the original error as `cause`
for logs:

```ts
throw new TooManyRequestsException('Slow down', { headers: { 'Retry-After': 30 } });
throw new ServiceUnavailableException('Payments are down', { cause: err });
throw new HttpException(402, 'Payment required');
```

## The default response

Without filters, Megh answers like this:

- **HTTP exceptions** keep their status. For 4xx the message and `data` are
  sent. For 5xx they are sent only when `NODE_ENV=development`; otherwise
  the message is `Internal Server Error`.
- **Validation failures**, from DTOs or the route schema, are a 400 with the
  individual issues in `errors`.
- **Framework errors** keep their status: malformed JSON (400), body too large
  (413), unsupported content type (415), rate limited (429) and so on.
- **Unknown routes** are a 404: `Route GET /nope not found`.
- **Anything else** is a 500. In development the body adds `error` and the
  first lines of `stack`.

Errors answered this way are logged: 4xx as warnings, the rest as errors with
the stack. Replace the logger, or turn it off, with `useErrorLogger`:

```ts
app.useErrorLogger((error, request, response) => {
  if (response.statusCode >= 500) Sentry.captureException(error);
});
app.useErrorLogger(false);
```

## Custom error handler

For a quick change, register a function. It sees every error, and
`response` holds what Megh would send by default:

```ts
app.useErrorHandler((error, { response }) => ({
  success: false,
  message: response.body.message,
}));
```

What the handler does decides what happens next:

| The handler…                                 | Result                                          |
| -------------------------------------------- | ----------------------------------------------- |
| returns a value                              | sent as the body, with `response.statusCode`    |
| calls `reply.code(...)` and returns a value  | sent with that status                           |
| sends the reply itself (`reply.send(...)`)   | nothing else runs                               |
| returns an `Error`                           | replaces the error; the next filter handles it  |
| returns nothing                              | the next filter, then the default response      |
| throws                                       | logged; the default response is sent            |

## Exception filters

A filter is a class with a `catch(error, ctx)` method, following the same
rules. `@Catch(...)` limits it to some error classes (subclasses included),
and its constructor can take services from the container.

```ts [src/filters/out-of-stock.filter.ts]
import { Catch, ConflictException, ExceptionFilter } from '@meghjs/core';
import { OutOfStockError } from '../errors/out-of-stock.error';

// Map a domain error to a 409, then let later filters format it.
@Catch(OutOfStockError)
export class OutOfStockFilter implements ExceptionFilter<OutOfStockError> {
  catch(error: OutOfStockError) {
    return new ConflictException(error.message);
  }
}
```

```ts [src/filters/problem-json.filter.ts]
import { Catch, ErrorContext, ExceptionFilter } from '@meghjs/core';

// Answer every error as RFC 9457 problem details.
@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  catch(error: unknown, { reply, request, response }: ErrorContext) {
    reply.type('application/problem+json');
    return {
      type: 'about:blank',
      status: response.statusCode,
      title: response.body.message,
      instance: request.url,
    };
  }
}
```

```ts [src/app.ts]
app.useExceptionFilters([OutOfStockFilter, ProblemJsonFilter]);
```

Global filters run in registration order. `ctx.response` is already
redacted in production, so building on it does not leak 5xx details.

### Per controller or route

`@UseFilters` applies filters to one controller or one route. They run
before the global ones: route filters first, then controller filters.

```ts
import { ApiController, Post, UseFilters } from '@meghjs/core';

@UseFilters(PaymentErrorFilter)
@ApiController('/payments')
export class PaymentsController {
  @UseFilters((error, { reply }) => {
    reply.code(409);
    return { message: 'Refund already issued' };
  })
  @Post('/:id/refund')
  refund() {
    // ...
  }
}
```

`useExceptionFilters`, `useErrorHandler` and `@UseFilters` take filter
classes, filter instances or functions. Register global filters before
`app.run()`.

## Testing

`MeghTest` uses the same error handling as `run()`, filters included, so
tests see the responses production sends.
