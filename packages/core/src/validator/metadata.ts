/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Metadata for Megh's validation and transformation decorators.
 *
 * Rules are stored and looked up the way class-validator and class-transformer
 * store theirs, so a DTO validates, transforms and reports errors the same
 * whichever set of decorators it uses.
 */

/** What a message function receives (class-validator's `ValidationArguments`). */
export type ValidationArguments = {
  value: any;
  constraints: any[];
  targetName: string;
  object: object;
  property: string;
};

/** Options every validation decorator accepts (class-validator's `ValidationOptions`). */
export type ValidationOptions = {
  /** Validate each item of an array, Set or Map instead of the value itself. */
  each?: boolean;
  /** Replaces the default message. `$property`, `$value`, `$target` and `$constraint1`… are filled in. */
  message?: string | ((args: ValidationArguments) => string);
  /** Accepted for compatibility. Request validation runs without groups, so every rule applies. */
  groups?: string[];
  /** Accepted for compatibility; has no effect without groups. */
  always?: boolean;
  /** Accepted for compatibility; not part of request errors. */
  context?: any;
};

/**
 * class-validator's metadata types. Inherited rules are dropped when the
 * subclass declares a rule of the same kind on the same property.
 */
export type RuleKind =
  | "customValidation"
  | "isDefined"
  | "conditionalValidation"
  | "nestedValidation"
  | "whitelistValidation";

export type RuleCheck = {
  /** Reference implementation: is `value` valid? */
  fn: (value: any, constraints: any[], prepared: any) => boolean;
  /**
   * The same check as a JavaScript expression, for the compiler. `x` is the
   * value expression, `k` the constraints array, `p` the prepared value.
   */
  inline?: (x: string, k: string, p: string) => string;
  /** Computed once when the validator is compiled (e.g. enum values, a RegExp). */
  prepare?: (constraints: any[]) => any;
};

export type ValidationRule = {
  kind: RuleKind;
  /** Constraint key in errors (`isString`), or `isOptional` / undefined. */
  name?: string;
  target: Function;
  propertyName: string;
  constraints: any[];
  each: boolean;
  message?: ValidationOptions["message"];
  defaultMessage?: (eachPrefix: string, args: ValidationArguments) => string;
  check?: RuleCheck;
  /** For `conditionalValidation`: validate only when this returns truthy. */
  condition?: (object: any, value: any) => boolean;
};

export type TypeHelpOptions = {
  newObject: any;
  object: Record<string, any>;
  property: string;
};

export type TypeRule = {
  typeFunction?: (options?: TypeHelpOptions) => Function;
  reflectedType: any;
};

/** class-transformer's `TransformationType`. */
export enum TransformationType {
  PLAIN_TO_CLASS = 0,
  CLASS_TO_PLAIN = 1,
  CLASS_TO_CLASS = 2,
}

export type TransformFnParams = {
  value: any;
  key: string;
  obj: any;
  type: TransformationType;
  options: Record<string, any>;
};

export type TransformOptions = {
  toClassOnly?: boolean;
  toPlainOnly?: boolean;
  groups?: string[];
  since?: number;
  until?: number;
};

export type TransformRule = {
  transformFn: (params: TransformFnParams) => any;
  options: TransformOptions;
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Rules per class, in the order the decorators ran. Map order = registration order. */
const validationRules = new Map<Function, ValidationRule[]>();
const typeRules = new Map<Function, Map<string, TypeRule>>();
const transformRules = new Map<Function, Map<string, TransformRule[]>>();

/** Bumped on every registration, so compiled validators can be rebuilt. */
let revision = 0;
export const metadataRevision = () => revision;

export function addValidationRule(rule: ValidationRule) {
  let list = validationRules.get(rule.target);
  if (!list) validationRules.set(rule.target, (list = []));
  list.push(rule);
  revision++;
}

export function addTypeRule(
  target: Function,
  propertyName: string,
  rule: TypeRule,
) {
  let map = typeRules.get(target);
  if (!map) typeRules.set(target, (map = new Map()));
  // class-transformer keeps one @Type per property; the last one registered wins.
  map.set(propertyName, rule);
  revision++;
}

export function addTransformRule(
  target: Function,
  propertyName: string,
  rule: TransformRule,
) {
  let map = transformRules.get(target);
  if (!map) transformRules.set(target, (map = new Map()));
  let list = map.get(propertyName);
  if (!list) map.set(propertyName, (list = []));
  list.push(rule);
  revision++;
}

/**
 * The rules that apply to `target`: its own, then inherited ones, as
 * class-validator's `getTargetValidationMetadatas` returns them.
 */
export function getValidationRules(target: Function): ValidationRule[] {
  if (typeof target !== "function" || !target.prototype) return [];
  const original = validationRules.get(target) ?? [];
  const inherited: ValidationRule[] = [];
  for (const [cls, list] of validationRules) {
    if (target.prototype instanceof cls) inherited.push(...list);
  }
  const unique = inherited.filter(
    (rule) =>
      !original.some(
        (own) =>
          own.propertyName === rule.propertyName && own.kind === rule.kind,
      ),
  );
  return original.concat(unique);
}

/** Does `target` (or an ancestor) carry Megh validation decorators? */
export function isMeghValidatorClass(target: unknown): boolean {
  return typeof target === "function" && getValidationRules(target).length > 0;
}

/** class-transformer's `getAncestors`: nearest first. */
function getAncestors(target: Function): Function[] {
  const ancestors: Function[] = [];
  for (
    let base = Object.getPrototypeOf(target.prototype.constructor);
    base && typeof base.prototype !== "undefined";
    base = Object.getPrototypeOf(base.prototype.constructor)
  ) {
    ancestors.push(base);
  }
  return ancestors;
}

/** `@Type` for a property: the class's own, else the nearest ancestor's. */
export function findTypeRule(
  target: Function,
  propertyName: string,
): TypeRule | undefined {
  const own = typeRules.get(target)?.get(propertyName);
  if (own) return own;
  for (const ancestor of getAncestors(target)) {
    const found = typeRules.get(ancestor)?.get(propertyName);
    if (found) return found;
  }
  return undefined;
}

/**
 * `@Transform`s that apply when turning a plain object into a class, in
 * class-transformer's order (`findTransformMetadatas` + group filtering).
 */
export function findTransformRules(
  target: Function,
  propertyName: string,
): TransformRule[] {
  const fromAncestors: TransformRule[] = [];
  for (const ancestor of getAncestors(target)) {
    const list = transformRules.get(ancestor)?.get(propertyName);
    if (list) fromAncestors.push(...list);
  }
  const own = transformRules.get(target)?.get(propertyName) ?? [];
  return fromAncestors
    .slice()
    .reverse()
    .concat(own.slice().reverse())
    .filter(({ options }) => {
      if (!options) return true;
      if (options.groups && options.groups.length) return false;
      if (options.toClassOnly === true && options.toPlainOnly === true)
        return true;
      if (options.toClassOnly === true) return true;
      if (options.toPlainOnly === true) return false;
      return true;
    });
}

/** Property names with `@Type` or `@Transform`, on the class and its ancestors. */
export function getTransformedProperties(target: Function): string[] {
  const names = new Set<string>();
  for (const cls of [target, ...getAncestors(target)]) {
    for (const key of typeRules.get(cls)?.keys() ?? []) names.add(key);
    for (const key of transformRules.get(cls)?.keys() ?? []) names.add(key);
  }
  return [...names];
}

/** Has `target` (or an ancestor) any `@Type` / `@Transform`? */
export function hasTransformRules(target: Function): boolean {
  return getTransformedProperties(target).length > 0;
}
