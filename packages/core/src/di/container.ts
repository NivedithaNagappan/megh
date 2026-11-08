/**
 * Megh's dependency injection container.
 *
 * Core and plugins use only this module. Classes are registered with
 * `@Injectable()` (or a decorator that applies it, such as `@AppService` or
 * `@Controller`) and built on first `get`, with their constructor parameters
 * resolved from the types TypeScript emits as `design:paramtypes`, or pulled
 * in with `inject()` from field initializers.
 */
import { SystemUseError } from "../common/exceptions/system-exception";

/** A class that can be instantiated with `new`. */
export type Constructable<T = unknown> = new (...args: any[]) => T;

/** A named identifier for a value that is not a class, such as a database client. */
export class Token<T = unknown> {
  /** Phantom field that carries `T`, so `get(token)` is typed. Never set. */
  declare readonly __type?: T;

  constructor(public readonly name?: string) {}

  toString(): string {
    return `Token(${this.name ?? "anonymous"})`;
  }
}

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

/**
 * Thrown when the container can't resolve or construct a service. Extends
 * `SystemUseError`, which `inject()` threw before it moved here.
 */
export class ContainerError extends SystemUseError {
  constructor(message: string) {
    super(message);
    this.name = "ContainerError";
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Marks a class entry that has not been constructed yet. */
const EMPTY: unique symbol = Symbol("megh.di.empty");

type Entry = {
  /** Set for class identifiers: what `reset()` rebuilds from. */
  type?: Function;
  value: unknown;
};

type InjectHandler = {
  /** The class for a constructor parameter, the prototype for a property. */
  target: object;
  propertyName?: string | symbol;
  index?: number;
  factory: () => unknown;
};

type Store = {
  version: 1;
  entries: Map<unknown, Entry>;
  handlers: InjectHandler[];
  /** Classes being constructed, outermost first, for cycle detection and error paths. */
  constructing: Function[];
};

// One registry per process, even if the app ends up with two copies of
// @meghjs/core (for example a plugin that installed its own). Without this,
// services a plugin registers would be invisible to the app, with no error.
const STORE_KEY = Symbol.for("megh.di.store");

function createStore(): Store {
  return { version: 1, entries: new Map(), handlers: [], constructing: [] };
}

function store(): Store {
  const holder = globalThis as unknown as Record<symbol, Store | undefined>;
  const existing = holder[STORE_KEY];
  if (!existing) return (holder[STORE_KEY] = createStore());
  if (existing.version !== 1) {
    throw new ContainerError(
      "Two incompatible versions of @meghjs/core are loaded. Run `npm ls @meghjs/core` and make every package use the same version.",
    );
  }
  return existing;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function describe(id: unknown): string {
  if (typeof id === "function") return id.name || "<anonymous class>";
  if (typeof id === "string") return `"${id}"`;
  if (id instanceof Token || (id && typeof id === "object" && "name" in id)) {
    return `Token "${(id as Token).name ?? "anonymous"}"`;
  }
  return String(id);
}

/** "A -> B -> " when resolving inside a constructor chain, else "". */
function pathPrefix(s: Store): string {
  return s.constructing.length
    ? `Cannot construct ${s.constructing.map(describe).join(" -> ")}: `
    : "";
}

function notRegistered(s: Store, id: unknown): ContainerError {
  const name = describe(id);
  const hint =
    typeof id === "function"
      ? `${name} is not registered. Mark it with @Injectable() (or @AppService), or register an instance with MeghContainer.set(${name}, value).`
      : `Nothing is registered for ${name}. Register a value with MeghContainer.set(...) before resolving it.`;
  return new ContainerError(pathPrefix(s) + hint);
}

/** The reflect-metadata API, which the app loads (`import "reflect-metadata"`). */
type MetadataApi = {
  getMetadata(key: string, target: object): unknown;
  hasOwnMetadata(key: string, target: object): boolean;
};

function metadataApi(): MetadataApi | null {
  const api = Reflect as unknown as Partial<MetadataApi>;
  return typeof api.getMetadata === "function" ? (api as MetadataApi) : null;
}

/**
 * The class whose own `design:paramtypes` a constructor uses. A subclass
 * without its own constructor inherits its parent's, so parameter injection
 * handlers registered on the parent apply to it.
 */
function paramOwner(api: MetadataApi, type: Function): Function {
  let current: Function | null = type;
  while (current && current !== Function.prototype) {
    if (api.hasOwnMetadata("design:paramtypes", current)) return current;
    current = Object.getPrototypeOf(current) as Function | null;
  }
  return type;
}

const PRIMITIVE_PARAM_TYPES = new Set([
  "string",
  "boolean",
  "number",
  "object",
]);

function resolveParams(s: Store, type: Function): unknown[] {
  const api = metadataApi();
  if (!api) return [];
  const paramTypes =
    (api.getMetadata("design:paramtypes", type) as unknown[] | undefined) ?? [];
  const owner = paramOwner(api, type);

  return paramTypes.map((paramType, index) => {
    const handler = s.handlers.find(
      (h) => h.target === owner && h.index === index,
    );
    if (handler) return handler.factory();
    // Interfaces, unions and primitives are emitted as Object/String/...;
    // there's nothing to resolve them by, so they're left undefined.
    if (
      typeof paramType === "function" &&
      paramType.name &&
      !PRIMITIVE_PARAM_TYPES.has(paramType.name.toLowerCase())
    ) {
      return resolve(s, paramType);
    }
    return undefined;
  });
}

function applyPropertyHandlers(s: Store, type: Function, instance: unknown) {
  for (const handler of s.handlers) {
    if (typeof handler.index === "number" || !handler.propertyName) continue;
    const owner = (handler.target as { constructor: Function }).constructor;
    if (owner !== type && !(type.prototype instanceof owner)) continue;
    (instance as Record<string | symbol, unknown>)[handler.propertyName] =
      handler.factory();
  }
}

function resolve(s: Store, id: unknown): unknown {
  const entry = s.entries.get(id);
  if (!entry) throw notRegistered(s, id);
  if (entry.value !== EMPTY) return entry.value;

  const type = entry.type as Constructable;
  if (s.constructing.includes(type)) {
    const cycle = [...s.constructing, type].map(describe).join(" -> ");
    throw new ContainerError(
      `Circular dependency: ${cycle}. Break the cycle, for example by calling inject() for one side inside a method instead of in a constructor or field initializer.`,
    );
  }

  s.constructing.push(type);
  let instance: unknown;
  try {
    instance = new type(...resolveParams(s, type));
  } finally {
    s.constructing.pop();
  }

  entry.value = instance;
  // After the value is stored, so a property factory that resolves this
  // class again gets the instance instead of starting over.
  applyPropertyHandlers(s, type, instance);
  return instance;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const Container: ContainerApi = {
  get: <T>(id: ServiceIdentifier<T>): T => resolve(store(), id) as T,
  set: <T>(id: ServiceIdentifier<T>, value: T): void => {
    // A class key remembers its class, so reset() rebuilds it afterwards;
    // tokens and strings keep their value.
    store().entries.set(id, {
      type: typeof id === "function" ? id : undefined,
      value,
    });
  },
  has: (id: ServiceIdentifier): boolean => store().entries.has(id),
  reset: (): void => {
    // Instances are discarded without calling destroy() on them: closing
    // resources the app still owns (a DataSource, a connection pool) is the
    // app's job, in onClose.
    for (const entry of store().entries.values()) {
      if (entry.type) entry.value = EMPTY;
    }
  },
};

export type InjectOptions = {
  /**
   * Return `undefined` instead of throwing when nothing is registered for
   * the identifier. Errors while constructing a registered service (a
   * missing dependency further down, a constructor that throws) still throw.
   */
  optional?: boolean;
};

/**
 * Resolve a service, token or named value from the container.
 *
 * Use it in field initializers, so a class needs no constructor parameters
 * (and no emitted decorator metadata) to receive its dependencies:
 *
 *   @AppService
 *   class UserService {
 *     private readonly db = inject(Database);
 *     private readonly mailer = inject(Mailer, { optional: true });
 *   }
 *
 * Inside a class the container is building, it shares that construction:
 * cycles and missing dependencies are reported with the full chain. It also
 * works anywhere else, such as a startup script: `inject(Environment)`.
 */
export function inject<T>(id: ServiceIdentifier<T>): T;
export function inject<T>(
  id: ServiceIdentifier<T>,
  options: InjectOptions & { optional: true },
): T | undefined;
export function inject<T>(
  id: ServiceIdentifier<T>,
  options?: InjectOptions,
): T | undefined;
export function inject<T>(
  id: ServiceIdentifier<T>,
  options: InjectOptions = {},
): T | undefined {
  const s = store();
  if (options.optional && !s.entries.has(id)) return undefined;
  return resolve(s, id) as T;
}

/**
 * Mark a class as resolvable by the container. Its constructor parameters
 * are injected from their declared types.
 */
export function Injectable(): ClassDecorator {
  return (target) => {
    const entries = store().entries;
    if (!entries.has(target))
      entries.set(target, { type: target, value: EMPTY });
  };
}

/**
 * Build a property or constructor-parameter decorator that injects the
 * value returned by `factory`, for dependencies a type alone can't
 * identify (for example a TypeORM repository for a given entity).
 */
export function createInjectDecorator(factory: () => unknown) {
  return function (
    object: object,
    propertyName: string | symbol | undefined,
    index?: number,
  ) {
    store().handlers.push({ target: object, propertyName, index, factory });
  };
}
