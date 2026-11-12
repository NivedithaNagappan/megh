/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Validation decorators with class-validator's names, options, checks,
 * constraint keys and default messages. Switching a DTO over is a change of
 * import:
 *
 *   import { IsString, MinLength } from "class-validator";   // before
 *   import { IsString, MinLength } from "@meghjs/core";      // after
 *
 * Megh compiles each DTO's rules once into a single function; see
 * `compiler.ts`. `@IsUUID`, `@IsUrl` and `@IsEmail` with non-default options
 * call the `validator` package, as class-validator does, so they accept
 * exactly the same values; install it to use them. `@IsEmail()` with default
 * options needs no package (see `is-email.ts`).
 */
import {
  addValidationRule,
  RuleCheck,
  RuleKind,
  ValidationArguments,
  ValidationOptions,
} from "./metadata";
import { isEmailDefault, usesDefaultEmailOptions } from "./is-email";

type Message = (eachPrefix: string, args: ValidationArguments) => string;

/** class-validator's `ValidateBy`: one named, synchronous check. */
function validateBy(
  name: string,
  constraints: any[],
  check: RuleCheck,
  message: Message,
  options?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    addValidationRule({
      // class-validator gives `isDefined` its own metadata type.
      kind: (name === "isDefined"
        ? "isDefined"
        : "customValidation") as RuleKind,
      name,
      target: object.constructor,
      propertyName: String(propertyName),
      constraints,
      each: !!options?.each,
      message: options?.message,
      defaultMessage: message,
      check,
    });
  };
}

/** Load a `validator` package function, or explain how to install it. */
function validatorLib(
  fn: string,
  decorator: string,
): (...args: any[]) => boolean {
  try {
    const mod = require(`validator/lib/${fn}`);
    return mod.default ?? mod;
  } catch {
    throw new Error(
      `[Megh] @${decorator}() uses the "validator" package. Install it: npm install validator`,
    );
  }
}

/**
 * `validator`'s `isEmail` throws `URIError` for an unpaired surrogate; that is
 * an invalid address, not a server error.
 */
function rejectOnUriError(fn: (...args: any[]) => boolean) {
  return (...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      if (error instanceof URIError) return false;
      throw error;
    }
  };
}

// ── Common ──────────────────────────────────────────────────────────────────

/** Skip every other rule on this property when the value is `null` or `undefined`. */
export function IsOptional(options?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) => {
    const key = String(propertyName);
    addValidationRule({
      kind: "conditionalValidation",
      name: "isOptional",
      target: object.constructor,
      propertyName: key,
      constraints: [],
      each: !!options?.each,
      message: options?.message,
      condition: (o) => o[key] !== null && o[key] !== undefined,
    });
  };
}

/** Validate this property only when `condition(object, value)` is truthy. */
export function ValidateIf(
  condition: (object: any, value: any) => boolean,
  options?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    addValidationRule({
      kind: "conditionalValidation",
      target: object.constructor,
      propertyName: String(propertyName),
      constraints: [condition],
      each: !!options?.each,
      message: options?.message,
      condition,
    });
  };
}

/** Allow the property through the whitelist without checking it. */
export function Allow(options?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) => {
    addValidationRule({
      kind: "whitelistValidation",
      target: object.constructor,
      propertyName: String(propertyName),
      constraints: [],
      each: !!options?.each,
      message: options?.message,
    });
  };
}

/**
 * Validate the nested object (or each item of an array) against its own
 * class. Pair it with `@Type(() => Class)` so the value becomes an instance.
 */
export function ValidateNested(options?: ValidationOptions): PropertyDecorator {
  const eachPrefix = options?.each ? "each value in " : "";
  const message =
    options?.message ||
    eachPrefix + "nested property $property must be either object or array";
  return (object, propertyName) => {
    addValidationRule({
      kind: "nestedValidation",
      target: object.constructor,
      propertyName: String(propertyName),
      constraints: [],
      each: !!options?.each,
      message,
    });
  };
}

export const IsDefined = (options?: ValidationOptions) =>
  validateBy(
    "isDefined",
    [],
    {
      fn: (v) => v !== undefined && v !== null,
      inline: (x) => `(${x} !== undefined && ${x} !== null)`,
    },
    (p) => p + "$property should not be null or undefined",
    options,
  );

export const IsNotEmpty = (options?: ValidationOptions) =>
  validateBy(
    "isNotEmpty",
    [],
    {
      fn: (v) => v !== "" && v !== null && v !== undefined,
      inline: (x) => `(${x} !== "" && ${x} !== null && ${x} !== undefined)`,
    },
    (p) => p + "$property should not be empty",
    options,
  );

export const IsEmpty = (options?: ValidationOptions) =>
  validateBy(
    "isEmpty",
    [],
    {
      fn: (v) => v === "" || v === null || v === undefined,
      inline: (x) => `(${x} === "" || ${x} === null || ${x} === undefined)`,
    },
    (p) => p + "$property must be empty",
    options,
  );

export const IsIn = (values: readonly any[], options?: ValidationOptions) =>
  validateBy(
    "isIn",
    [values],
    {
      fn: (v, [list]) => Array.isArray(list) && list.some((item) => item === v),
      // indexOf compares with ===, like `some(item => item === v)`.
      inline: (x, k) =>
        `(Array.isArray(${k}[0]) && ${k}[0].indexOf(${x}) !== -1)`,
    },
    (p) => p + "$property must be one of the following values: $constraint1",
    options,
  );

export const IsNotIn = (values: readonly any[], options?: ValidationOptions) =>
  validateBy(
    "isNotIn",
    [values],
    {
      fn: (v, [list]) =>
        !Array.isArray(list) || !list.some((item) => item === v),
      inline: (x, k) =>
        `(!Array.isArray(${k}[0]) || ${k}[0].indexOf(${x}) === -1)`,
    },
    (p) =>
      p + "$property should not be one of the following values: $constraint1",
    options,
  );

// ── Type checks ─────────────────────────────────────────────────────────────

export const IsString = (options?: ValidationOptions) =>
  validateBy(
    "isString",
    [],
    {
      fn: (v) => v instanceof String || typeof v === "string",
      inline: (x) => `(typeof ${x} === "string" || ${x} instanceof String)`,
    },
    (p) => p + "$property must be a string",
    options,
  );

export type IsNumberOptions = {
  allowNaN?: boolean;
  allowInfinity?: boolean;
  maxDecimalPlaces?: number;
};

function isNumber(value: any, options: IsNumberOptions = {}): boolean {
  if (typeof value !== "number") return false;
  if (value === Infinity || value === -Infinity) return !!options.allowInfinity;
  if (Number.isNaN(value)) return !!options.allowNaN;
  if (options.maxDecimalPlaces !== undefined) {
    let decimalPlaces = 0;
    if (value % 1 !== 0) decimalPlaces = value.toString().split(".")[1].length;
    if (decimalPlaces > options.maxDecimalPlaces) return false;
  }
  return Number.isFinite(value);
}

export const IsNumber = (
  numberOptions: IsNumberOptions = {},
  options?: ValidationOptions,
) =>
  validateBy(
    "isNumber",
    [numberOptions],
    {
      fn: (v, [o]) => isNumber(v, o),
      // With no options a number is valid exactly when it is finite.
      prepare: ([o]) =>
        !o ||
        (!o.allowNaN && !o.allowInfinity && o.maxDecimalPlaces === undefined),
      inline: (x, k, p) =>
        `(${p} ? (typeof ${x} === "number" && Number.isFinite(${x})) : H.isNumber(${x}, ${k}[0]))`,
    },
    (p) =>
      p + "$property must be a number conforming to the specified constraints",
    options,
  );

export const IsInt = (options?: ValidationOptions) =>
  validateBy(
    "isInt",
    [],
    {
      fn: (v) => typeof v === "number" && Number.isInteger(v),
      inline: (x) => `(typeof ${x} === "number" && Number.isInteger(${x}))`,
    },
    (p) => p + "$property must be an integer number",
    options,
  );

export const IsBoolean = (options?: ValidationOptions) =>
  validateBy(
    "isBoolean",
    [],
    {
      fn: (v) => v instanceof Boolean || typeof v === "boolean",
      inline: (x) => `(typeof ${x} === "boolean" || ${x} instanceof Boolean)`,
    },
    (p) => p + "$property must be a boolean value",
    options,
  );

export const IsDate = (options?: ValidationOptions) =>
  validateBy(
    "isDate",
    [],
    {
      fn: (v) => v instanceof Date && !isNaN(v.getTime()),
      inline: (x) => `(${x} instanceof Date && !isNaN(${x}.getTime()))`,
    },
    (p) => p + "$property must be a Date instance",
    options,
  );

export const IsArray = (options?: ValidationOptions) =>
  validateBy(
    "isArray",
    [],
    { fn: (v) => Array.isArray(v), inline: (x) => `Array.isArray(${x})` },
    (p) => p + "$property must be an array",
    options,
  );

export const IsObject = (options?: ValidationOptions) =>
  validateBy(
    "isObject",
    [],
    {
      fn: (v) =>
        v != null &&
        (typeof v === "object" || typeof v === "function") &&
        !Array.isArray(v),
      inline: (x) =>
        `(${x} != null && (typeof ${x} === "object" || typeof ${x} === "function") && !Array.isArray(${x}))`,
    },
    (p) => p + "$property must be an object",
    options,
  );

function validEnumValues(entity: any): any[] {
  return Object.entries(entity)
    .filter(([key]) => isNaN(parseInt(key)))
    .map(([, value]) => value);
}

export const IsEnum = (entity: object, options?: ValidationOptions) =>
  validateBy(
    "isEnum",
    [entity, validEnumValues(entity)],
    {
      fn: (v, [e]) =>
        Object.keys(e)
          .map((k) => e[k])
          .includes(v),
      prepare: ([e]) => Object.keys(e).map((k) => e[k]),
      inline: (x, k, p) => `${p}.includes(${x})`,
    },
    (p) => p + "$property must be one of the following values: $constraint2",
    options,
  );

// ── Numbers ─────────────────────────────────────────────────────────────────

export const Min = (minValue: number, options?: ValidationOptions) =>
  validateBy(
    "min",
    [minValue],
    {
      fn: (v, [m]) => typeof v === "number" && typeof m === "number" && v >= m,
      inline: (x, k) =>
        `(typeof ${x} === "number" && typeof ${k}[0] === "number" && ${x} >= ${k}[0])`,
    },
    (p) => p + "$property must not be less than $constraint1",
    options,
  );

export const Max = (maxValue: number, options?: ValidationOptions) =>
  validateBy(
    "max",
    [maxValue],
    {
      fn: (v, [m]) => typeof v === "number" && typeof m === "number" && v <= m,
      inline: (x, k) =>
        `(typeof ${x} === "number" && typeof ${k}[0] === "number" && ${x} <= ${k}[0])`,
    },
    (p) => p + "$property must not be greater than $constraint1",
    options,
  );

export const IsPositive = (options?: ValidationOptions) =>
  validateBy(
    "isPositive",
    [],
    {
      fn: (v) => typeof v === "number" && v > 0,
      inline: (x) => `(typeof ${x} === "number" && ${x} > 0)`,
    },
    (p) => p + "$property must be a positive number",
    options,
  );

export const IsNegative = (options?: ValidationOptions) =>
  validateBy(
    "isNegative",
    [],
    {
      fn: (v) => typeof v === "number" && v < 0,
      inline: (x) => `(typeof ${x} === "number" && ${x} < 0)`,
    },
    (p) => p + "$property must be a negative number",
    options,
  );

// ── Strings ─────────────────────────────────────────────────────────────────

/**
 * Length as the `validator` package's `isLength` counts it: a surrogate pair
 * or a character followed by a variation selector is one character.
 */
export function stringLength(str: string): number {
  // Both patterns need one of these code units; skip the regexes otherwise.
  if (!/[\uD800-\uDBFF︎️]/.test(str)) return str.length;
  const presentationSequences = str.match(/[^️︎][️︎]/g) || [];
  const surrogatePairs = str.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || [];
  return str.length - presentationSequences.length - surrogatePairs.length;
}

/** `validator`'s `isLength(str, { min, max })`. */
export function isLength(str: string, min: any, max: any): boolean {
  const len = stringLength(str);
  const lower = min || 0;
  return len >= lower && (typeof max === "undefined" || len <= max);
}

export const MinLength = (min: number, options?: ValidationOptions) =>
  validateBy(
    "minLength",
    [min],
    {
      fn: (v, [m]) => typeof v === "string" && isLength(v, m, undefined),
      inline: (x, k) =>
        `(typeof ${x} === "string" && H.isLength(${x}, ${k}[0], undefined))`,
    },
    (p) =>
      p + "$property must be longer than or equal to $constraint1 characters",
    options,
  );

export const MaxLength = (max: number, options?: ValidationOptions) =>
  validateBy(
    "maxLength",
    [max],
    {
      fn: (v, [m]) => typeof v === "string" && isLength(v, 0, m),
      inline: (x, k) =>
        `(typeof ${x} === "string" && H.isLength(${x}, 0, ${k}[0]))`,
    },
    (p) =>
      p + "$property must be shorter than or equal to $constraint1 characters",
    options,
  );

export const Length = (
  min: number,
  max?: number,
  options?: ValidationOptions,
) =>
  validateBy(
    "isLength",
    [min, max],
    {
      fn: (v, [lo, hi]) => typeof v === "string" && isLength(v, lo, hi),
      inline: (x, k) =>
        `(typeof ${x} === "string" && H.isLength(${x}, ${k}[0], ${k}[1]))`,
    },
    (p, args) => {
      const isMinLength =
        args?.constraints[0] !== null && args?.constraints[0] !== undefined;
      const isMaxLength =
        args?.constraints[1] !== null && args?.constraints[1] !== undefined;
      if (
        isMinLength &&
        (!args.value || args.value.length < args?.constraints[0])
      ) {
        return (
          p +
          "$property must be longer than or equal to $constraint1 characters"
        );
      } else if (isMaxLength && args.value.length > args?.constraints[1]) {
        return (
          p +
          "$property must be shorter than or equal to $constraint2 characters"
        );
      }
      return (
        p +
        "$property must be longer than or equal to $constraint1 and shorter than or equal to $constraint2 characters"
      );
    },
    options,
  );

/** `validator`'s `matches`. */
function matchesPattern(
  str: string,
  pattern: any,
  modifiers?: string,
): boolean {
  if (Object.prototype.toString.call(pattern) !== "[object RegExp]") {
    pattern = new RegExp(pattern, modifiers);
  }
  return !!str.match(pattern);
}

export function Matches(
  pattern: RegExp,
  options?: ValidationOptions,
): PropertyDecorator;
export function Matches(
  pattern: string | RegExp,
  modifiers?: string,
  options?: ValidationOptions,
): PropertyDecorator;
export function Matches(
  pattern: string | RegExp,
  modifiersOrOptions?: string | ValidationOptions,
  options?: ValidationOptions,
): PropertyDecorator {
  let modifiers: string | undefined;
  if (modifiersOrOptions && modifiersOrOptions instanceof Object && !options) {
    options = modifiersOrOptions;
  } else {
    modifiers = modifiersOrOptions as string | undefined;
  }
  return validateBy(
    "matches",
    [pattern, modifiers],
    {
      fn: (v, [pt, mod]) => typeof v === "string" && matchesPattern(v, pt, mod),
      // A string pattern is compiled once. A sticky one keeps per-call state,
      // so it is rebuilt each time, as `validator` does.
      prepare: ([pt, mod]) =>
        Object.prototype.toString.call(pt) === "[object RegExp]"
          ? pt
          : typeof mod === "string" && mod.includes("y")
            ? undefined
            : new RegExp(pt, mod),
      inline: (x, k, p) =>
        `(typeof ${x} === "string" && (${p} !== undefined ? !!${x}.match(${p}) : H.matches(${x}, ${k}[0], ${k}[1])))`,
    },
    (p) => p + "$property must match $constraint1 regular expression",
    options,
  );
}

export function IsEmail(emailOptions?: object, options?: ValidationOptions) {
  // Default options are checked by Megh itself; others by the `validator` package.
  const isEmail = usesDefaultEmailOptions(emailOptions)
    ? (value: string, _options?: unknown) => isEmailDefault(value)
    : rejectOnUriError(validatorLib("isEmail", "IsEmail"));
  return validateBy(
    "isEmail",
    [emailOptions],
    {
      fn: (v, [o]) => typeof v === "string" && isEmail(v, o),
      prepare: () => isEmail,
      inline: (x, k, p) => `(typeof ${x} === "string" && ${p}(${x}, ${k}[0]))`,
    },
    (p) => p + "$property must be an email",
    options,
  );
}

export function IsUUID(version?: any, options?: ValidationOptions) {
  const isUUID = validatorLib("isUUID", "IsUUID");
  return validateBy(
    "isUuid",
    [version],
    {
      fn: (v, [ver]) => typeof v === "string" && isUUID(v, ver),
      prepare: () => isUUID,
      inline: (x, k, p) => `(typeof ${x} === "string" && ${p}(${x}, ${k}[0]))`,
    },
    (p) => p + "$property must be a UUID",
    options,
  );
}

export function IsUrl(urlOptions?: object, options?: ValidationOptions) {
  const isURL = validatorLib("isURL", "IsUrl");
  return validateBy(
    "isUrl",
    [urlOptions],
    {
      fn: (v, [o]) => typeof v === "string" && isURL(v, o),
      prepare: () => isURL,
      inline: (x, k, p) => `(typeof ${x} === "string" && ${p}(${x}, ${k}[0]))`,
    },
    (p) => p + "$property must be a URL address",
    options,
  );
}

// ── Arrays ──────────────────────────────────────────────────────────────────

export const ArrayMinSize = (min: number, options?: ValidationOptions) =>
  validateBy(
    "arrayMinSize",
    [min],
    {
      fn: (v, [m]) => Array.isArray(v) && v.length >= m,
      inline: (x, k) => `(Array.isArray(${x}) && ${x}.length >= ${k}[0])`,
    },
    (p) => p + "$property must contain at least $constraint1 elements",
    options,
  );

export const ArrayMaxSize = (max: number, options?: ValidationOptions) =>
  validateBy(
    "arrayMaxSize",
    [max],
    {
      fn: (v, [m]) => Array.isArray(v) && v.length <= m,
      inline: (x, k) => `(Array.isArray(${x}) && ${x}.length <= ${k}[0])`,
    },
    (p) => p + "$property must contain no more than $constraint1 elements",
    options,
  );

export const ArrayNotEmpty = (options?: ValidationOptions) =>
  validateBy(
    "arrayNotEmpty",
    [],
    {
      fn: (v) => Array.isArray(v) && v.length > 0,
      inline: (x) => `(Array.isArray(${x}) && ${x}.length > 0)`,
    },
    (p) => p + "$property should not be empty",
    options,
  );

/** Helpers the compiled code calls (`H.*`). */
export const checkHelpers = { isNumber, isLength, matches: matchesPattern };
