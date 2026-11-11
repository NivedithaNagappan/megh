/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import type { IncomingMessage } from "http";

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** The default header that carries the request ID in and out. */
export const DEFAULT_REQUEST_ID_HEADER = "x-request-id";

/** Accept a client-sent ID only if it is short and log-safe. */
const SAFE_ID = /^[\w.:-]{1,128}$/;

/**
 * The ID of the request being handled, or `undefined` outside a request.
 * Works anywhere in the request's async call chain: services, repositories,
 * event listeners.
 *
 *   logger.info({ requestId: getRequestId() }, "charging card");
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Options for request IDs: `false` turns them off. */
export type RequestIdOptions =
  | false
  | {
      /** Header read from the request and set on the response. Defaults to `x-request-id`. */
      header?: string;
      /** Make an ID when the request has none. Defaults to `crypto.randomUUID`. */
      generate?: () => string;
    };

/**
 * A Fastify `genReqId` that reuses a safe incoming header (so an ID set by a
 * proxy or the calling service carries through) or generates a new one.
 */
export function createRequestIdGenerator(
  header: string = DEFAULT_REQUEST_ID_HEADER,
  generate: () => string = randomUUID,
): (req: IncomingMessage) => string {
  const name = header.toLowerCase();
  return (req) => {
    const incoming = req.headers[name];
    const value = Array.isArray(incoming) ? incoming[0] : incoming;
    return value && SAFE_ID.test(value) ? value : generate();
  };
}

/**
 * Echo the request ID on the response and make it available through
 * {@link getRequestId} for the rest of the request.
 */
export function installRequestContext(
  app: FastifyInstance,
  header: string = DEFAULT_REQUEST_ID_HEADER,
) {
  // A callback hook with `run(…, done)`: everything Fastify does after
  // `done()` (the remaining hooks, the handler) runs inside the store.
  app.addHook("onRequest", (request, reply, done) => {
    reply.header(header, request.id);
    storage.run({ requestId: String(request.id) }, done);
  });
}
