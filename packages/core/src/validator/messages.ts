/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Error messages, built exactly as class-validator builds them.
 */

/** class-validator's `constraintToString`. */
export function constraintToString(constraint: any): string {
  if (Array.isArray(constraint)) return constraint.join(", ");
  if (typeof constraint === "symbol") constraint = constraint.description;
  return `${constraint}`;
}

/**
 * class-validator's `ValidationUtils.replaceMessageSpecialTokens`.
 *
 * class-validator runs one `new RegExp` + `replace` per token, in order:
 * `$constraint1`…, `$value`, `$property`, `$target`. When none of the inserted
 * texts contains `$`, that chain can neither create new tokens nor trigger
 * `replace` patterns (`$&`, `$$`…), so a template compiled once and filled in
 * a single pass gives the same string. Otherwise the original chain runs.
 */
export function replaceMessageSpecialTokens(message: any, args: any): string {
  let text: string | undefined;
  if (message instanceof Function) text = message(args);
  else if (typeof message === "string") text = message;

  if (typeof text === "string" && text) {
    const fast = fillTemplate(text, args);
    if (fast !== undefined) return fast;
  }
  return replaceSequentially(text, args);
}

// A template part: literal text, or a token. Tokens: constraint index (>= 0),
// VALUE, PROPERTY, TARGET.
const VALUE = -1;
const PROPERTY = -2;
const TARGET = -3;
type Template = (string | number)[];

const templates = new Map<string, Template | null>();
const MAX_TEMPLATES = 512;

const startsWithAt = (text: string, word: string, at: number) =>
  text.startsWith(word, at);

/**
 * Split `text` into literals and tokens, as the replace chain would see them
 * with `count` constraints and `$value` on or off. `null` when a `$` starts
 * nothing the chain recognises (a literal `$` next to a token could combine
 * with inserted text).
 */
function compileTemplate(
  text: string,
  count: number,
  withValue: boolean,
): Template | null {
  const parts: Template = [];
  let literal = "";
  let i = 0;
  while (i < text.length) {
    const dollar = text.indexOf("$", i);
    if (dollar === -1) {
      literal += text.slice(i);
      break;
    }
    literal += text.slice(i, dollar);
    let token: number | undefined;
    let length = 0;
    if (startsWithAt(text, "$constraint", dollar)) {
      // `$constraint1` is replaced before `$constraint12`, so the first digit decides.
      const d = text.charCodeAt(dollar + 11) - 0x30;
      if (d >= 1 && d <= 9 && d <= count) {
        token = d - 1;
        length = 12;
      } else {
        literal += "$constraint";
        i = dollar + 11;
        continue;
      }
    } else if (startsWithAt(text, "$value", dollar)) {
      if (withValue) {
        token = VALUE;
        length = 6;
      } else {
        literal += "$value";
        i = dollar + 6;
        continue;
      }
    } else if (startsWithAt(text, "$property", dollar)) {
      token = PROPERTY;
      length = 9;
    } else if (startsWithAt(text, "$target", dollar)) {
      token = TARGET;
      length = 7;
    } else {
      return null;
    }
    if (literal) parts.push(literal);
    literal = "";
    parts.push(token);
    i = dollar + length;
  }
  if (literal) parts.push(literal);
  return parts;
}

/** The single-pass result, or `undefined` when only the replace chain is exact. */
function fillTemplate(text: string, args: any): string | undefined {
  const constraints: any[] = Array.isArray(args.constraints)
    ? args.constraints
    : [];
  // Every constraint is stringified, as the chain does, even if unused.
  const values: string[] = [];
  for (const constraint of constraints) {
    const s = constraintToString(constraint);
    if (s.includes("$")) return undefined;
    values.push(s);
  }
  const value = args.value;
  const withValue =
    value !== undefined &&
    value !== null &&
    (typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number");
  const valueText = withValue ? String(value) : "";
  const property = String(args.property);
  const target = String(args.targetName);
  if (
    valueText.includes("$") ||
    property.includes("$") ||
    target.includes("$")
  ) {
    return undefined;
  }

  const key = `${constraints.length}${withValue ? "v" : "-"}\u0000${text}`;
  let template = templates.get(key);
  if (template === undefined) {
    template = compileTemplate(text, constraints.length, withValue);
    if (templates.size >= MAX_TEMPLATES) templates.clear();
    templates.set(key, template);
  }
  if (template === null) return undefined;

  let out = "";
  for (const part of template) {
    if (typeof part === "string") out += part;
    else if (part >= 0) out += values[part];
    else if (part === VALUE) out += valueText;
    else if (part === PROPERTY) out += property;
    else out += target;
  }
  return out;
}

/** The original chain. */
function replaceSequentially(text: string | undefined, args: any): string {
  if (text && Array.isArray(args.constraints)) {
    args.constraints.forEach((constraint: any, index: number) => {
      text = text!.replace(
        new RegExp(`\\$constraint${index + 1}`, "g"),
        constraintToString(constraint),
      );
    });
  }
  if (
    text &&
    args.value !== undefined &&
    args.value !== null &&
    ["string", "boolean", "number"].includes(typeof args.value)
  ) {
    text = text.replace(/\$value/g, args.value);
  }
  if (text) text = text.replace(/\$property/g, args.property);
  if (text) text = text.replace(/\$target/g, args.targetName);
  return text as string;
}
