/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import { instanceToPlain, plainToInstance } from "class-transformer";
import { Constructor } from "./common-utils";

export function pick<T extends object>(obj: T, paths: string[]): Partial<T> {
  const result: any = {};

  for (const path of paths) {
    const keys = path.split(".");
    let source: any = obj;
    let target: any = result;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (!(key in source)) break;

      if (i === keys.length - 1) {
        target[key] = source[key];
      } else {
        source = source[key];
        target[key] = target[key] || {};
        target = target[key];
      }
    }
  }

  return result;
}

export function exclude<T extends object>(
  obj: T | T[],
  paths: string[],
): Partial<T> | Partial<T>[] {
  if (Array.isArray(obj)) {
    return obj.map((item) => exclude(item, paths) as Partial<T>);
  }

  const clone = structuredClone(obj); // Or use lodash.cloneDeep
  for (const path of paths) {
    const keys = path.split(".");
    let target: any = clone;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) break;
      target = target[keys[i]];
    }

    delete target?.[keys[keys.length - 1]];
  }

  return clone;
}

type ScalarHint = "string" | "number" | "boolean" | "date";

/**
 * The scalar type a hint names. The router passes `"string"`, `"number"` and
 * `"boolean"` (from `getDataType`); nested casting passes the constructors.
 */
function scalarHint(typeHint: any): ScalarHint | undefined {
  if (typeHint === String || typeHint === "string") return "string";
  if (typeHint === Number || typeHint === "number") return "number";
  if (typeHint === Boolean || typeHint === "boolean") return "boolean";
  if (typeHint === Date) return "date";
  return undefined;
}

/**
 * Cast a raw path or query value. With a scalar type hint, only that type is
 * produced; without one, numbers, booleans, dates and JSON are inferred.
 */
export function autoCast(value: any, typeHint?: any, schema?: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const elementType = Array.isArray(typeHint) ? typeHint[0] : undefined;
    return value.map((v) => autoCast(v, elementType));
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      let fieldType: any = undefined;

      if (schema?.properties?.[key]?.type) {
        const t = schema.properties[key].type;
        fieldType =
          t === "integer" || t === "number"
            ? Number
            : t === "boolean"
              ? Boolean
              : t === "array"
                ? Array
                : t === "object"
                  ? Object
                  : String;
      }

      result[key] = autoCast(val, fieldType);
    }
    return result;
  }

  if (typeof value !== "string") return value;

  // A declared scalar type wins over guessing. Values that don't fit are
  // returned as-is so the validator can reject them.
  const scalar = scalarHint(typeHint);
  if (scalar === "string") return value;

  const trimmed = value.trim();

  if (scalar === "number") {
    const n = trimmed === "" ? NaN : Number(trimmed);
    return Number.isNaN(n) ? value : n;
  }

  if (scalar === "boolean") {
    const lower = trimmed.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
    return value;
  }

  if (scalar === "date") {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? value : d;
  }

  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;

  if (trimmed !== "" && !isNaN(Number(trimmed))) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      return autoCast(parsed, typeHint, schema);
    } catch {
      return trimmed;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}([Tt]\d{2}:\d{2})?/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  return trimmed;
}

/**
 * Deeply normalizes query strings into nested JS objects.
 */
export function normalizeQueryDeep(
  query: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};

  const setDeep = (obj: any, path: string[], value: any) => {
    let current = obj;

    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      const nextKey = path[i + 1];

      if (i === path.length - 1) {
        if (key === "") {
          if (!Array.isArray(current)) current = [];
          current.push(value);
        } else if (Array.isArray(current[key])) {
          current[key].push(value);
        } else if (current[key] !== undefined) {
          current[key] = [current[key], value];
        } else {
          current[key] = value;
        }
      } else {
        if (!current[key]) {
          current[key] = nextKey === "" || /^\d+$/.test(nextKey) ? [] : {};
        }
        current = current[key];
      }
    }
  };

  for (const [rawKey, rawValue] of Object.entries(query)) {
    const path = [];
    const regex = /([^\[\]]+)|(\[\])/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(rawKey)) !== null) {
      if (match[1]) path.push(match[1]);
      else if (match[2]) path.push("");
    }

    if (path.length === 0) {
      if (result[rawKey]) {
        if (Array.isArray(result[rawKey])) result[rawKey].push(rawValue);
        else result[rawKey] = [result[rawKey], rawValue];
      } else {
        result[rawKey] = rawValue;
      }
    } else {
      setDeep(result, path, rawValue);
    }
  }

  return result;
}

export function transformObjectByInstanceToObject(
  instance: Constructor,
  value: object,
) {
  return instanceToPlain(plainToInstance(instance, value), {
    excludeExtraneousValues: true,
    exposeUnsetFields: true,
  });
}

export function jsonToJs(value: string) {
  try {
    return JSON.parse(value);
  } catch (err: any) {
    return false;
  }
}

export function jsonToInstance(value: string, instance: Constructor) {
  try {
    const parsedValue = JSON.parse(value);
    return plainToInstance(instance, parsedValue);
  } catch (err: any) {
    return false;
  }
}
