/**
 * Megh's dependency injection API.
 *
 * Core and plugins use only this module, never `typedi` directly, so the
 * underlying container can be replaced without changing any caller.
 */
import {
  Container as TypediContainer,
  Service,
  Token as TypediToken,
} from "typedi";

/** A class that can be instantiated with `new`. */
export type Constructable<T = unknown> = new (...args: any[]) => T;

/** A named identifier for a value that is not a class, such as a database client. */
export class Token<T = unknown> extends TypediToken<T> {}

/** Anything the container can resolve: a class, a token or a string name. */
export type ServiceIdentifier<T = unknown> =
  Constructable<T> | (abstract new (...args: any[]) => T) | Token<T> | string;

export interface ContainerApi {
  /** Resolve `id`, constructing it (and its constructor dependencies) on first use. */
  get<T>(id: ServiceIdentifier<T>): T;
  /** Register `value` as the instance for `id`. */
  set<T>(id: ServiceIdentifier<T>, value: T): void;
  /** Whether a value is registered for `id`. */
  has(id: ServiceIdentifier): boolean;
  /**
   * Discard constructed class instances, so the next `get` builds them again.
   * Values set for tokens and strings are kept. Intended for tests.
   */
  reset(): void;
}

export const Container: ContainerApi = {
  get: <T>(id: ServiceIdentifier<T>): T => TypediContainer.get(id as any) as T,
  set: <T>(id: ServiceIdentifier<T>, value: T): void => {
    TypediContainer.set(id as any, value);
  },
  has: (id: ServiceIdentifier): boolean => TypediContainer.has(id as any),
  reset: (): void => {
    // typedi's own reset() also calls destroy() on each discarded instance,
    // without awaiting it. That disposes resources the app still owns, such as
    // a TypeORM DataSource registered under its class, and leaks a rejection
    // if the app already closed it. Discard the instances without disposing
    // them; closing resources is the app's job (`onClose`).
    for (const service of typediServices()) {
      if (service.type || service.factory) service.value = EMPTY_VALUE;
    }
  },
};

// typedi internals used by reset(). typedi has no exports map, so the marker
// for "not constructed yet" can be imported from its build.
const { EMPTY_VALUE } = require("typedi/cjs/empty.const") as {
  EMPTY_VALUE: symbol;
};
type TypediServiceEntry = { type: unknown; factory: unknown; value: unknown };
const typediServices = () =>
  (TypediContainer.of() as unknown as { services: TypediServiceEntry[] })
    .services;

/**
 * Mark a class as resolvable by the container. Its constructor parameters
 * are injected from their declared types.
 */
export function Injectable(): ClassDecorator {
  return (target) => {
    Service()(target as any);
  };
}

/**
 * Build a property or constructor-parameter decorator that injects the
 * value returned by `factory`, for dependencies a type alone can't
 * identify (for example a TypeORM repository for a given entity).
 */
export function createInjectDecorator(factory: () => unknown) {
  return function (
    object: any,
    propertyName: string | symbol | undefined,
    index?: number,
  ) {
    TypediContainer.registerHandler({
      object,
      propertyName: propertyName as string | undefined,
      index,
      value: factory,
    });
  };
}
