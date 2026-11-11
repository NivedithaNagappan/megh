import { describe, expect, it } from "vitest";
import { autoCast } from "./object-utils";

describe("autoCast", () => {
  describe("string hint", () => {
    it.each([String, "string"])(
      "keeps numeric-looking values as strings (%s)",
      (hint) => {
        expect(autoCast("42", hint)).toBe("42");
        expect(autoCast("007", hint)).toBe("007");
      },
    );

    it.each([String, "string"])(
      "keeps boolean, date and JSON-looking values as strings (%s)",
      (hint) => {
        expect(autoCast("true", hint)).toBe("true");
        expect(autoCast("2026-11-11", hint)).toBe("2026-11-11");
        const json = JSON.stringify({ a: 1 });
        expect(autoCast(json, hint)).toBe(json);
      },
    );

    it("does not trim a declared string", () => {
      expect(autoCast(" padded ", "string")).toBe(" padded ");
    });
  });

  describe("number hint", () => {
    it.each([Number, "number"])("casts numeric strings (%s)", (hint) => {
      expect(autoCast("42", hint)).toBe(42);
      expect(autoCast("-1.5", hint)).toBe(-1.5);
    });

    it("leaves non-numeric strings for the validator to reject", () => {
      expect(autoCast("abc", "number")).toBe("abc");
      expect(autoCast("", "number")).toBe("");
    });
  });

  describe("boolean hint", () => {
    it.each([Boolean, "boolean"])("casts true/false/1/0 (%s)", (hint) => {
      expect(autoCast("true", hint)).toBe(true);
      expect(autoCast("FALSE", hint)).toBe(false);
      expect(autoCast("1", hint)).toBe(true);
      expect(autoCast("0", hint)).toBe(false);
    });

    it("leaves other strings for the validator to reject", () => {
      expect(autoCast("yes please", "boolean")).toBe("yes please");
    });
  });

  it("casts to a Date with a Date hint", () => {
    expect(autoCast("2026-11-11", Date)).toEqual(new Date("2026-11-11"));
    expect(autoCast("not a date", Date)).toBe("not a date");
  });

  describe("no hint", () => {
    it("still infers numbers, booleans and dates", () => {
      expect(autoCast("42")).toBe(42);
      expect(autoCast("true")).toBe(true);
      expect(autoCast("false")).toBe(false);
      expect(autoCast("2026-11-11")).toEqual(new Date("2026-11-11"));
      expect(autoCast("hello")).toBe("hello");
    });
  });

  it("casts array elements by the element hint", () => {
    expect(autoCast(["1", "2"], [String])).toEqual(["1", "2"]);
    expect(autoCast(["1", "2"], [Number])).toEqual([1, 2]);
  });

  it("casts object fields by the schema", () => {
    const schema = {
      properties: { code: { type: "string" }, qty: { type: "integer" } },
    };
    expect(autoCast({ code: "0042", qty: "3" }, undefined, schema)).toEqual({
      code: "0042",
      qty: 3,
    });
  });

  it("passes null and undefined through", () => {
    expect(autoCast(null, "string")).toBeNull();
    expect(autoCast(undefined, "number")).toBeUndefined();
  });
});
