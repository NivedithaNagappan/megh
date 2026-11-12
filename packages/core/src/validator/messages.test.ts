import { describe, expect, it } from "vitest";
import { replaceMessageSpecialTokens } from "./messages";

// class-validator's own implementation, the reference.
const {
  ValidationUtils,
} = require("class-validator/cjs/validation/ValidationUtils");

function outcome(fn: () => string): string {
  try {
    return JSON.stringify(fn());
  } catch (error: any) {
    return `throws ${error?.name}: ${error?.message}`;
  }
}

function expectSame(message: any, args: any) {
  const want = outcome(() =>
    ValidationUtils.replaceMessageSpecialTokens(message, args),
  );
  const got = outcome(() => replaceMessageSpecialTokens(message, args));
  if (got !== want) {
    throw new Error(
      `message ${JSON.stringify(String(message))} with ${JSON.stringify(
        args,
        (_k, v) =>
          typeof v === "symbol"
            ? String(v)
            : v instanceof RegExp
              ? String(v)
              : v,
      )}: class-validator ${want}, Megh ${got}`,
    );
  }
}

const args = (over: any = {}) => ({
  targetName: "UserDto",
  property: "name",
  object: {},
  value: "Ada",
  constraints: [],
  ...over,
});

describe("replaceMessageSpecialTokens", () => {
  it.each([
    ["$property must be a string", args()],
    [
      "each value in $property must be longer than or equal to $constraint1 characters",
      args({ constraints: [3] }),
    ],
    [
      "$property must be one of the following values: $constraint1",
      args({ constraints: [["a", "b"]] }),
    ],
    [
      "$property must match $constraint1 regular expression",
      args({ constraints: [/^[a-z]+$/, undefined] }),
    ],
    [
      "$constraint1 $constraint2 $constraint12 $constraint0 $constraint9",
      args({ constraints: [1, 2] }),
    ],
    [
      "$constraint1$constraint10",
      args({ constraints: Array.from({ length: 12 }, (_, i) => `c${i}`) }),
    ],
    ["$value is bad, $values too, $target $targetName", args({ value: 42 })],
    ["$value stays", args({ value: { a: 1 } })],
    ["$value stays", args({ value: null })],
    ["email: $value", args({ value: "$property $target $&" })],
    ["$property", args({ property: "$id" })],
    ["$target", args({ targetName: undefined })],
    ["$$property and $ alone and $& here", args()],
    ["$constraint1", args({ constraints: ["$&x"] })],
    ["$constraint1", args({ constraints: ["$property"] })],
    // A literal `$` before a token whose text spells another token: the chain re-expands it.
    ["$$constraint1", args({ constraints: ["value"] })],
    [
      "$$constraint1 $$value",
      args({ constraints: ["property"], value: "target" }),
    ],
    ["", args()],
    [undefined, args()],
    [
      (a: any) => `${a.property} from fn: $constraint1`,
      args({ constraints: [7] }),
    ],
    ["$constraint1", args({ constraints: [Symbol("s")] })],
    ["$constraint1", args({ constraints: [[Symbol("s")]] })],
    ["$constraint1", args({ constraints: "not an array" })],
  ])("matches class-validator for %j", (message, a) => {
    expectSame(message, a);
  });

  it("matches class-validator on 100,000 random templates", () => {
    let seed = 0x3e55a6e;
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
    const pieces = [
      "$constraint",
      "$constraint1",
      "$constraint2",
      "$constraint3",
      "$constraint12",
      "$constraint0",
      "$constraint9",
      "$value",
      "$values",
      "$property",
      "$target",
      "$targetName",
      "$",
      "$$",
      "$&",
      "$1",
      "a",
      " ",
      "must be",
      "x$",
      "each value in ",
      ".",
      "constraint",
      "value",
    ];
    const pool: any[] = [
      0,
      1,
      -1.5,
      42,
      "",
      "a",
      "Ada",
      "$&",
      "$1",
      "$$",
      "$property",
      "$value",
      "$constraint1",
      "x$y",
      "value",
      "property",
      "target",
      "constraint1",
      "Name",
      true,
      false,
      null,
      undefined,
      ["a", "b"],
      ["$&"],
      [],
      /^a$/,
      /x/g,
      { a: 1 },
      Symbol("s"),
      NaN,
    ];
    for (let i = 0; i < 100_000; i++) {
      let message = "";
      const n = Math.floor(rand() * 6);
      for (let j = 0; j < n; j++) message += pick(pieces);
      const constraints = Array.from({ length: Math.floor(rand() * 12) }, () =>
        pick(pool),
      );
      expectSame(
        message,
        args({
          constraints: rand() < 0.05 ? undefined : constraints,
          value: pick(pool),
          property: pick(["name", "$id", "a$", "tags"]),
          targetName: pick(["UserDto", undefined, "$Dto", "Function"]),
        }),
      );
    }
  }, 60_000);
});
