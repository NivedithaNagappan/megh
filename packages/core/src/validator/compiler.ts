/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Compiles a DTO class's validation rules into one JavaScript function.
 *
 * The generated function walks the instance once: whitelist, then each
 * property's conditions, `@IsDefined`, checks and nested objects, in the order
 * class-validator's `ValidationExecutor` runs them with `whitelist` and
 * `forbidNonWhitelisted` on. Built-in checks are inlined; messages are only
 * built for checks that fail. Errors come out flattened, as
 * `transformAndValidate` reports them: `{ path, constraints }`, nested paths
 * dotted (`address.city`, `items.0.name`).
 *
 * Only property names and rule indexes are written into the generated source;
 * every value (constraints, messages, user functions) is passed in by
 * reference.
 */
import {
  getValidationRules,
  metadataRevision,
  ValidationRule,
} from "./metadata";
import { checkHelpers } from "./decorators";
import { replaceMessageSpecialTokens } from "./messages";
import { toInstance } from "./transform";

export type ValidationIssue = {
  path: string;
  constraints: Record<string, string>;
};

export type DtoValidationResult<T> = {
  value: T;
  errors: ValidationIssue[] | null;
};

type CheckFn = (object: any, errors: ValidationIssue[], prefix: string) => void;

const UNKNOWN_VALUE = "an unknown value was passed to the validate function";

const compiled = new WeakMap<
  Function,
  { revision: number; check: CheckFn | null }
>();

/** The compiled check for `target`, or `null` when it has no rules. */
export function getCheck(target: Function): CheckFn | null {
  const cached = compiled.get(target);
  if (cached && cached.revision === metadataRevision()) return cached.check;
  const rules = getValidationRules(target);
  const check = rules.length > 0 ? compileCheck(rules) : null;
  compiled.set(target, { revision: metadataRevision(), check });
  return check;
}

/**
 * Convert `value` into an instance of `target` (`@Type`, `@Transform`) and
 * validate it with its Megh decorators. Unknown properties are errors.
 *
 * Same result as `transformAndValidate` with class-validator and
 * class-transformer decorators.
 */
export function validateDto<T extends object>(
  target: new () => T,
  value: unknown,
): DtoValidationResult<T> {
  if (
    value !== null &&
    value !== undefined &&
    (typeof value !== "object" || Array.isArray(value))
  ) {
    return {
      value: value as T,
      errors: [
        { path: "", constraints: { isObject: "payload must be an object" } },
      ],
    };
  }
  const instance = toInstance(target, (value ?? {}) as object);
  const errors: ValidationIssue[] = [];
  const check = getCheck(target);
  if (check) check(instance, errors, "");
  else
    errors.push({
      path: "undefined",
      constraints: { unknownValue: UNKNOWN_VALUE },
    });
  return { value: instance, errors: errors.length > 0 ? errors : null };
}

// ---------------------------------------------------------------------------
// Runtime helpers the generated code calls
// ---------------------------------------------------------------------------

/** `ValidationExecutor.createValidationError`, message part. */
function message(rule: ValidationRule, object: any, value: any): string {
  const args = {
    targetName: object.constructor ? object.constructor.name : undefined,
    property: rule.propertyName,
    object,
    value,
    constraints: rule.constraints,
  };
  let text: any = rule.message || "";
  if (!rule.message && rule.defaultMessage) {
    const eachPrefix = rule.each ? "each value in " : "";
    text = rule.defaultMessage(eachPrefix, args as any);
  }
  return replaceMessageSpecialTokens(text, args);
}

const isArrayLike = (v: any) =>
  Array.isArray(v) || v instanceof Set || v instanceof Map;

/** Items of an array, Set or Map, as `each: true` checks them. */
function items(v: any): any[] {
  if (v instanceof Map) return Array.from(v.values());
  return Array.isArray(v) ? v : Array.from(v);
}

/** `ValidationExecutor.execute` on a nested object, with its own class's rules. */
function execute(object: any, errors: ValidationIssue[], prefix: string) {
  const check = object.constructor ? getCheck(object.constructor) : null;
  if (check) check(object, errors, prefix);
  else
    errors.push({
      path: prefix + "undefined",
      constraints: { unknownValue: UNKNOWN_VALUE },
    });
}

/** One item of a nested array (`performValidations` with only nested rules). */
function nestedItem(
  rules: ValidationRule[],
  value: any,
  errors: ValidationIssue[],
  path: string,
) {
  if (value === undefined) return;
  if (isArrayLike(value)) {
    for (let i = 0; i < rules.length; i++)
      nestedEach(rules, value, errors, path);
  } else if (value instanceof Object) {
    for (let i = 0; i < rules.length; i++) execute(value, errors, path + ".");
  } else {
    const constraints: Record<string, string> = {};
    for (const rule of rules) {
      constraints.nestedValidation = message(rule, rule.target, value);
    }
    errors.push({ path, constraints });
  }
}

/** Every item of a nested array, Set or Map, under `path.<index>`. */
function nestedEach(
  rules: ValidationRule[],
  value: any,
  errors: ValidationIssue[],
  path: string,
) {
  const list = value instanceof Set ? Array.from(value) : value;
  list.forEach((sub: any, index: any) => {
    nestedItem(rules, sub, errors, path + "." + index.toString());
  });
}

const helpers = {
  ...checkHelpers,
  message,
  isArrayLike,
  items,
  execute,
  nestedEach,
};

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function compileCheck(rules: ValidationRule[]): CheckFn {
  // groupByPropertyName: properties in order of their first rule.
  const byProperty = new Map<string, ValidationRule[]>();
  for (const rule of rules) {
    let list = byProperty.get(rule.propertyName);
    if (!list) byProperty.set(rule.propertyName, (list = []));
    list.push(rule);
  }

  const R: ValidationRule[] = []; // rules referenced by index
  const P: any[] = []; // prepared values, same index
  const NESTED: ValidationRule[][] = []; // nested-rule lists per property
  const ref = (rule: ValidationRule) => {
    R.push(rule);
    P.push(
      rule.check?.prepare ? rule.check.prepare(rule.constraints) : undefined,
    );
    return R.length - 1;
  };

  const head: string[] = [];
  const body: string[] = [];

  body.push(
    "var keys = Object.keys(o), i, k, v, c, ok, okEach, it;",
    "for (i = 0; i < keys.length; i++) {",
    "  k = keys[i];",
    "  if (!A.has(k)) errs.push({ path: prefix + k, constraints: { whitelistValidation: \"property \" + k + \" should not exist\" } });",
    "}",
  );

  const test = (rule: ValidationRule, j: number, x: string) => {
    const check = rule.check!;
    if (check.inline) return check.inline(x, `k${j}`, `p${j}`);
    return `f${j}(${x}, k${j}, p${j})`;
  };

  for (const [name, list] of byProperty) {
    const key = JSON.stringify(name);
    const conditions = list.filter((r) => r.kind === "conditionalValidation");
    const defined = list.filter((r) => r.kind === "isDefined");
    const checks = list.filter((r) => r.kind === "customValidation");
    const nested = list.filter((r) => r.kind === "nestedValidation");

    body.push(`v = o[${key}];`, "ok = true;");
    for (const rule of conditions) {
      const j = ref(rule);
      head.push(`var f${j} = R[${j}].condition;`);
      // Every condition runs, as class-validator maps them all before reducing.
      body.push(`if (!f${j}(o, v)) ok = false;`);
    }
    body.push("if (ok) {", "c = undefined;");

    for (const rule of [...defined, ...checks]) {
      const j = ref(rule);
      head.push(
        `var k${j} = R[${j}].constraints, p${j} = P[${j}], f${j} = R[${j}].check.fn;`,
      );
      const fail = `(c || (c = {}))[${JSON.stringify(rule.name)}] = H.message(R[${j}], o, v);`;
      if (rule.each) {
        body.push(
          "if (H.isArrayLike(v)) {",
          "  okEach = true; it = H.items(v);",
          `  for (i = 0; i < it.length; i++) { if (!${test(rule, j, "it[i]")}) { okEach = false; break; } }`,
          "} else okEach = " + test(rule, j, "v") + ";",
          `if (!okEach) ${fail}`,
        );
      } else {
        body.push(`if (!${test(rule, j, "v")}) ${fail}`);
      }
    }

    let n = -1;
    if (nested.length > 0) {
      NESTED.push(nested);
      n = NESTED.length - 1;
      const indexes = nested.map(ref);
      // A value that is neither an object nor an array fails on the property itself.
      body.push(
        "if (v !== undefined && !H.isArrayLike(v) && !(v instanceof Object)) {",
        ...indexes.map(
          (j) =>
            `  (c || (c = {})).nestedValidation = H.message(R[${j}], R[${j}].target, v);`,
        ),
        "}",
      );
    }

    body.push(
      `if (c !== undefined) errs.push({ path: prefix + ${key}, constraints: c });`,
    );

    if (n >= 0) {
      body.push(
        "if (v !== undefined) {",
        "  if (H.isArrayLike(v)) {",
        ...nested.map(
          () => `    H.nestedEach(N[${n}], v, errs, prefix + ${key});`,
        ),
        "  } else if (v instanceof Object) {",
        ...nested.map(() => `    H.execute(v, errs, prefix + ${key} + ".");`),
        "  }",
        "}",
      );
    }
    body.push("}");
  }

  const allowed = new Set(byProperty.keys());
  const source =
    "\"use strict\";\n" +
    head.join("\n") +
    "\nreturn function check(o, errs, prefix) {\n" +
    body.join("\n") +
    "\n};";
  return new Function("H", "R", "P", "N", "A", source)(
    helpers,
    R,
    P,
    NESTED,
    allowed,
  );
}
