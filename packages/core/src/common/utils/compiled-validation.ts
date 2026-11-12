/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Experimental: compiled request DTO validation.
 *
 * `transformAndValidate` runs `plainToInstance` and then class-validator's
 * `validate()` on every request. Both re-read decorator metadata, allocate a
 * `ValidationError` per property and go through promises even when every
 * constraint is synchronous.
 *
 * `compileValidator` reads the same metadata once per DTO class and returns a
 * synchronous function that does the same work: it builds the instance the way
 * `plainToInstance` does, then calls the same constraint objects in the same
 * order with the same options (`whitelist` + `forbidNonWhitelisted`). Messages
 * are built only when a constraint fails, with class-validator's own message
 * functions and token replacement. The result is the same `{ value, errors }`
 * that `transformAndValidate` returns.
 *
 * Only DTOs whose behaviour can be reproduced exactly are compiled. Anything
 * else returns `undefined` from `compileValidator`, and the caller keeps using
 * `transformAndValidate`:
 *   - class-transformer metadata on the class (`@Type`, `@Transform`,
 *     `@Expose`, `@Exclude`)
 *   - nested or promise validation (`@ValidateNested`, `@ValidatePromise`)
 *   - constraints declared `async`
 *   - a class with no applicable validation metadata
 * At request time the compiled function returns `undefined` (meaning "use the
 * slow path for this request") if a constraint returns a promise anyway, or the
 * payload holds an object the plain-copy rules don't cover.
 */
import { Constructor } from "./common-utils";
import { getTransformerStorage } from "../../openapi/schema-properties";
import { replaceMessageSpecialTokens } from "../../validator/messages";
import type {
  RequestValidationIssue,
  RequestValidationResult,
} from "./validation-utils";

/** A compiled validator. `undefined` means: validate this payload the slow way. */
export type CompiledValidator<T = any> = (
  value: unknown,
) => RequestValidationResult<T> | undefined;

const IS_DEFINED = "isDefined";
const CUSTOM_VALIDATION = "customValidation";
const CONDITIONAL_VALIDATION = "conditionalValidation";
const WHITELIST = "whitelistValidation";

/** Thrown inside a run to abandon the fast path for that payload. */
const BAIL = Symbol("megh:compiled-validation:bail");

type Check = {
  metadata: any;
  /** Constraint metadata (`customValidatorMetadata`) and its instance. */
  constraint: any;
  each: boolean;
};

type PropertyPlan = {
  name: string;
  conditions: ((object: any, value: any) => boolean)[];
  /** `@IsDefined` checks, which run even when a condition would skip. */
  defined: Check[];
  checks: Check[];
};

type Plan = {
  target: Constructor;
  /** Property names that have validation metadata (whitelist). */
  allowed: Set<string>;
  properties: PropertyPlan[];
  /** Own accessor-without-setter / method names on `target.prototype`. */
  readonlyKeys: Set<string>;
};

const plans = new WeakMap<Function, CompiledValidator | null>();

let warnedUnavailable = false;

/**
 * Compile a validator for the DTO class `target`, or return `undefined` when
 * the class uses something the compiled path does not reproduce exactly.
 * Results are cached per class.
 */
export function compileValidator<T extends object>(
  target: Constructor<T>,
): CompiledValidator<T> | undefined {
  if (typeof target !== "function") return undefined;
  const cached = plans.get(target);
  if (cached !== undefined) return cached ?? undefined;
  let compiled: CompiledValidator | null = null;
  try {
    const plan = buildPlan(target);
    compiled = plan ? createRunner(plan) : null;
  } catch (error) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn(
        "[Megh] compiled validation is unavailable, using class-validator:",
        (error as Error)?.message ?? error,
      );
    }
    compiled = null;
  }
  plans.set(target, compiled);
  return compiled ?? undefined;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function buildPlan(target: Constructor): Plan | undefined {
  if (hasTransformerMetadata(target)) return undefined;

  const { getMetadataStorage } = require("class-validator");
  const storage = getMetadataStorage();
  // Same arguments `validate(instance, options)` uses: no schema, no groups,
  // `always` and `strictGroups` off.
  const metadatas: any[] = storage.getTargetValidationMetadatas(
    target,
    undefined,
    false,
    false,
    undefined,
  );
  // class-validator answers "unknownValue" for a class without metadata.
  if (metadatas.length === 0) return undefined;

  const grouped: Record<string, any[]> = storage.groupByPropertyName(metadatas);
  const allowed = new Set<string>();
  const properties: PropertyPlan[] = [];

  for (const name of Object.keys(grouped)) {
    const group = grouped[name];
    if (group.length > 0) allowed.add(name);
    const plan: PropertyPlan = {
      name,
      conditions: [],
      defined: [],
      checks: [],
    };

    for (const metadata of group) {
      switch (metadata.type) {
        case WHITELIST:
          break;
        case CONDITIONAL_VALIDATION:
          plan.conditions.push(metadata.constraints[0]);
          break;
        case IS_DEFINED:
        case CUSTOM_VALIDATION: {
          const constraints: any[] = storage.getTargetValidatorConstraints(
            metadata.constraintCls,
          );
          const list =
            metadata.type === IS_DEFINED ? plan.defined : plan.checks;
          for (const constraint of constraints) {
            if (constraint.async) return undefined;
            list.push({ metadata, constraint, each: !!metadata.each });
          }
          break;
        }
        default:
          // nestedValidation, promiseValidation or an unknown type.
          return undefined;
      }
    }
    properties.push(plan);
  }

  return {
    target,
    allowed,
    properties,
    readonlyKeys: readonlyKeysOf(target.prototype),
  };
}

/** Any class-transformer decorator on the class or its ancestors. */
function hasTransformerMetadata(target: Function): boolean {
  const storage = getTransformerStorage();
  if (!storage) return false;
  const maps = [
    storage._typeMetadatas,
    storage._transformMetadatas,
    storage._exposeMetadatas,
    storage._excludeMetadatas,
  ];
  let current: any = target;
  while (typeof current === "function" && current !== Function.prototype) {
    for (const map of maps) {
      const entry = map instanceof Map ? map.get(current) : undefined;
      if (entry instanceof Map ? entry.size > 0 : entry !== undefined) {
        return true;
      }
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Keys `plainToInstance` never assigns on an instance of this class: any own
 * property of the prototype without a setter (getters, methods). Inherited
 * methods are caught per instance by the `instanceof Function` check.
 */
function readonlyKeysOf(prototype: object | undefined): Set<string> {
  const keys = new Set<string>();
  if (!prototype) return keys;
  for (const key of Object.getOwnPropertyNames(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor && !descriptor.set) keys.add(key);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function createRunner(plan: Plan): CompiledValidator {
  const targetName = plan.target.name;

  return (value: unknown) => {
    if (
      value !== null &&
      value !== undefined &&
      (typeof value !== "object" || Array.isArray(value))
    ) {
      return {
        value: value as any,
        errors: [
          { path: "", constraints: { isObject: "payload must be an object" } },
        ],
      };
    }

    try {
      const instance = toInstance(plan, (value ?? {}) as Record<string, any>);
      const errors: RequestValidationIssue[] = [];

      // whitelist + forbidNonWhitelisted
      for (const key of Object.keys(instance)) {
        if (!plan.allowed.has(key)) {
          errors.push({
            path: key,
            constraints: { [WHITELIST]: `property ${key} should not exist` },
          });
        }
      }

      for (const property of plan.properties) {
        const propertyValue = instance[property.name];

        // Every condition is called, as `conditionalValidations` does.
        let canValidate = true;
        for (const condition of property.conditions) {
          if (!condition(instance, propertyValue)) canValidate = false;
        }
        if (!canValidate) continue;

        let constraints: Record<string, string> | undefined;
        for (const check of property.defined) {
          constraints = runCheck(
            check,
            instance,
            propertyValue,
            targetName,
            constraints,
          );
        }
        for (const check of property.checks) {
          constraints = runCheck(
            check,
            instance,
            propertyValue,
            targetName,
            constraints,
          );
        }
        if (constraints) errors.push({ path: property.name, constraints });
      }

      return { value: instance, errors: errors.length > 0 ? errors : null };
    } catch (error) {
      if (error === BAIL) return undefined;
      throw error;
    }
  };
}

function runCheck(
  check: Check,
  object: any,
  value: any,
  targetName: string,
  constraints: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const { metadata, constraint } = check;
  const args = {
    targetName,
    property: metadata.propertyName,
    object,
    value,
    constraints: metadata.constraints,
  };

  let valid: boolean;
  if (
    !check.each ||
    !(Array.isArray(value) || value instanceof Set || value instanceof Map)
  ) {
    const result = constraint.instance.validate(value, args);
    if (isThenable(result)) throw BAIL;
    valid = !!result;
  } else {
    const items =
      value instanceof Map ? Array.from(value.values()) : Array.from(value);
    valid = true;
    for (const item of items) {
      const result = constraint.instance.validate(item, args);
      if (isThenable(result)) throw BAIL;
      if (!result) valid = false;
    }
  }
  if (valid) return constraints;

  const type = constraint.name ? constraint.name : metadata.type;
  const out = constraints ?? {};
  out[type] = createMessage(metadata, constraint, args);
  return out;
}

/** `ValidationExecutor.createValidationError`, message part. */
function createMessage(metadata: any, constraint: any, args: any): string {
  let message: any = metadata.message || "";
  if (
    !metadata.message &&
    constraint &&
    constraint.instance.defaultMessage instanceof Function
  ) {
    message = constraint.instance.defaultMessage(args);
  }
  return replaceMessageSpecialTokens(message, args);
}

function isThenable(value: any): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

// ---------------------------------------------------------------------------
// plainToInstance, for a class without class-transformer metadata
// ---------------------------------------------------------------------------

/**
 * `plainToInstance(target, plain)` with default options: a new instance, then
 * every key of `plain` copied onto it, skipping `__proto__`, `constructor`,
 * read-only accessors and methods. Nested values are copied the same way.
 */
function toInstance(plan: Plan, plain: Record<string, any>): any {
  const instance: any = new (plan.target as any)();
  for (const key of Object.keys(plain)) {
    if (key === "__proto__" || key === "constructor") continue;
    if (plan.readonlyKeys.has(key) || instance[key] instanceof Function)
      continue;
    instance[key] = copyPlain(plain[key]);
  }
  return instance;
}

const objectPrototypeKeys = new Set(
  Object.getOwnPropertyNames(Object.prototype),
);

function copyPlain(value: any): any {
  if (value === null || typeof value !== "object") {
    // Functions are copied by reference too; JSON never contains them.
    return value;
  }
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = copyPlain(value[i]);
    return out;
  }
  if (value instanceof Date) return new Date(value.valueOf());
  const proto = Object.getPrototypeOf(value);
  // Plain objects only (incl. null-prototype objects from query parsing).
  // Sets, Maps, Buffers, promises and class instances take the slow path.
  if (proto !== Object.prototype && proto !== null) throw BAIL;
  // An own `constructor` key makes plainToInstance guess a type from it (and
  // throw for `{"constructor": 1}`); leave that to the slow path.
  if (Object.prototype.hasOwnProperty.call(value, "constructor")) throw BAIL;

  const out: Record<string, any> = {};
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor") continue;
    // `{}` inherits these; plainToInstance skips them.
    if (objectPrototypeKeys.has(key)) continue;
    out[key] = copyPlain(value[key]);
  }
  return out;
}
