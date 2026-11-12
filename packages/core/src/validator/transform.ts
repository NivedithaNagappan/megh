/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * `@Type` and `@Transform` with class-transformer's names and behaviour, and
 * the plain-object → instance conversion they drive (`plainToInstance` with
 * default options).
 */
import {
  addTransformRule,
  addTypeRule,
  findTransformRules,
  findTypeRule,
  getTransformedProperties,
  metadataRevision,
  TransformationType,
  TransformFnParams,
  TransformOptions,
  TransformRule,
  TypeHelpOptions,
  TypeRule,
} from "./metadata";

export type TypeOptions = {
  /** Not supported by Megh yet: use class-transformer for discriminated unions. */
  discriminator?: unknown;
  keepDiscriminatorProperty?: boolean;
};

/**
 * The class (or `Number`, `String`, `Boolean`, `Date`) a property's value is
 * converted to. Needed for `@ValidateNested` and for query values, which
 * arrive as strings.
 */
export function Type(
  typeFunction?: (options?: TypeHelpOptions) => Function,
  options: TypeOptions = {},
): PropertyDecorator {
  if (options && options.discriminator) {
    throw new Error(
      "[Megh] @Type({ discriminator }) is not supported yet; use class-transformer's @Type for this DTO.",
    );
  }
  return (target, propertyName) => {
    const reflectedType =
      typeof (Reflect as any).getMetadata === "function"
        ? (Reflect as any).getMetadata("design:type", target, propertyName)
        : undefined;
    addTypeRule(target.constructor, String(propertyName), {
      typeFunction,
      reflectedType,
    });
  };
}

/** Change a property's value while the request body becomes the DTO. */
export function Transform(
  transformFn: (params: TransformFnParams) => any,
  options: TransformOptions = {},
): PropertyDecorator {
  return (target, propertyName) => {
    addTransformRule(target.constructor, String(propertyName), {
      transformFn,
      options,
    });
  };
}

// ---------------------------------------------------------------------------
// plainToInstance
// ---------------------------------------------------------------------------

/** class-transformer's default options, as `@Transform` functions see them. */
const DEFAULT_OPTIONS = Object.freeze({
  enableCircularCheck: false,
  enableImplicitConversion: false,
  excludeExtraneousValues: false,
  excludePrefixes: undefined,
  exposeDefaultValues: false,
  exposeUnsetFields: true,
  groups: undefined,
  ignoreDecorators: false,
  strategy: undefined,
  targetMaps: undefined,
  version: undefined,
});

/** Own prototype properties without a setter: never assigned (getters, methods). */
const readonlyKeysCache = new WeakMap<object, Set<string>>();
function readonlyKeys(prototype: object): Set<string> {
  let keys = readonlyKeysCache.get(prototype);
  if (!keys) {
    keys = new Set();
    for (const key of Object.getOwnPropertyNames(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (descriptor && !descriptor.set) keys.add(key);
    }
    readonlyKeysCache.set(prototype, keys);
  }
  return keys;
}

function instantiateArrayType(arrayType: any): any {
  const array = new arrayType();
  if (!(array instanceof Set) && !("push" in array)) return [];
  return array;
}

/** A class's resolved `@Type` / `@Transform` rules, by property. */
type ClassRules = {
  revision: number;
  types: Map<string, TypeRule>;
  transforms: Map<string, TransformRule[]>;
};
const classRulesCache = new WeakMap<Function, ClassRules>();
function classRules(type: Function): ClassRules {
  const cached = classRulesCache.get(type);
  if (cached && cached.revision === metadataRevision()) return cached;
  const rules: ClassRules = {
    revision: metadataRevision(),
    types: new Map(),
    transforms: new Map(),
  };
  for (const key of getTransformedProperties(type)) {
    const typeRule = findTypeRule(type, key);
    if (typeRule) rules.types.set(key, typeRule);
    const transforms = findTransformRules(type, key);
    if (transforms.length) rules.transforms.set(key, transforms);
  }
  classRulesCache.set(type, rules);
  return rules;
}

const isPromise = (p: any) =>
  p !== null && typeof p === "object" && typeof p.then === "function";

/**
 * `plainToInstance(target, plain)`: a new instance of `target` with every key
 * of `plain` converted by the class's `@Type` and `@Transform` rules.
 */
export function toInstance<T>(target: new () => T, plain: object): T {
  return convert(plain, target, undefined, false);
}

/** class-transformer's `TransformOperationExecutor.transform`, plain → class. */
function convert(
  value: any,
  targetType: any,
  arrayType: any,
  isMap: boolean,
): any {
  if (Array.isArray(value) || value instanceof Set) {
    const out = arrayType ? instantiateArrayType(arrayType) : [];
    value.forEach((sub: any) => {
      const converted = convert(sub, targetType, undefined, sub instanceof Map);
      if (out instanceof Set) out.add(converted);
      else out.push(converted);
    });
    return out;
  }
  if (!isMap) {
    if (targetType === String) return value == null ? value : String(value);
    if (targetType === Number) return value == null ? value : Number(value);
    if (targetType === Boolean) return value == null ? value : Boolean(value);
    if (targetType === Date || value instanceof Date) {
      if (value instanceof Date) return new Date(value.valueOf());
      return value == null ? value : new Date(value);
    }
    if (
      typeof Buffer !== "undefined" &&
      (targetType === Buffer || value instanceof Buffer)
    ) {
      return value == null ? value : Buffer.from(value);
    }
    if (isPromise(value)) {
      return new Promise((resolve, reject) => {
        value.then(
          (data: any) => resolve(convert(data, targetType, undefined, false)),
          reject,
        );
      });
    }
  }
  if (typeof value !== "object" || value === null) return value;

  let type = targetType;
  if (!type && value.constructor !== Object) {
    // An object pretending to be an array (`{ __proto__: [] }`) is not trusted.
    if (!(!Array.isArray(value) && value.constructor === Array)) {
      type = value.constructor;
    }
  }
  // `{"constructor": 1}` makes class-transformer throw; treat it as plain.
  if (typeof type !== "function") type = undefined;

  const keys: string[] =
    isMap && value instanceof Map
      ? Array.from(value.keys())
      : Object.keys(value);
  const out: any = isMap ? new Map() : type ? new type() : {};
  const prototype = out.constructor ? out.constructor.prototype : undefined;
  const skip = prototype ? readonlyKeys(prototype) : undefined;
  const rules = type ? classRules(type) : undefined;

  for (const key of keys) {
    if (key === "__proto__" || key === "constructor") continue;
    const sub = value[key];

    let subType: any;
    let subIsMap = sub instanceof Map;
    let arrayItemsType: any;
    if (type && isMap) {
      subType = type;
    } else if (rules) {
      const rule = rules.types.get(key);
      if (rule) {
        const helpOptions = { newObject: out, object: value, property: key };
        subType = rule.typeFunction
          ? rule.typeFunction(helpOptions)
          : rule.reflectedType;
        subIsMap = subIsMap || rule.reflectedType === Map;
        if (Array.isArray(sub)) arrayItemsType = rule.reflectedType;
      }
    }

    if (skip && (skip.has(key) || out[key] instanceof Function)) continue;

    let result = convert(sub, subType, arrayItemsType, subIsMap);
    const transforms = rules?.transforms.get(key);
    if (transforms) {
      for (const rule of transforms) {
        result = rule.transformFn({
          value: result,
          key,
          obj: value,
          type: TransformationType.PLAIN_TO_CLASS,
          options: DEFAULT_OPTIONS,
        });
      }
    }
    if (out instanceof Map) out.set(key, result);
    else out[key] = result;
  }
  return out;
}
