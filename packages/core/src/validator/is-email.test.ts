import { describe, expect, it } from "vitest";
import validatorIsEmail from "validator/lib/isEmail";
import { isEmailDefault, usesDefaultEmailOptions } from "./is-email";
import { IsEmail } from "./decorators";
import { validateDto } from "./compiler";

/** `true`/`false`, or the error thrown. */
function outcome(fn: () => boolean): string {
  try {
    return String(fn());
  } catch (error: any) {
    return `throws ${error?.name}: ${error?.message}`;
  }
}

/** validator's answer, except an unpaired surrogate (URIError) is just "not an email". */
function expected(fn: () => boolean): string {
  const result = outcome(fn);
  return result.startsWith("throws URIError") ? "false" : result;
}

function expectSame(str: string, options?: any) {
  const want = expected(() =>
    validatorIsEmail(str, options === undefined ? undefined : { ...options }),
  );
  const actual = outcome(() => isEmailDefault(str));
  if (actual !== want) {
    throw new Error(
      `isEmail(${JSON.stringify(str)}): validator says ${want}, Megh says ${actual}`,
    );
  }
}

const label63 = "a".repeat(63);
const cases: string[] = [
  // valid
  "foo@bar.com",
  "x@x.au",
  "foo@bar.com.au",
  "foo+bar@bar.com",
  "hans.m端ller@test.com",
  "hans@m端ller.com",
  "test|123@m端ller.com",
  "test123+ext@gmail.com",
  "some.name.midd.leNa.me+extension@GoogleMail.com",
  "\"foobar\"@example.com",
  "\"  foo  m端ller \"@example.com",
  "\"foo\\@bar\"@example.com",
  `${"a".repeat(64)}@${label63}.com`,
  "test@xn--80ak6aa92e.com",
  "a@b.xn--p1ai",
  "user@sub-domain.example.co",
  "!#$%&'*+-/=?^_`{|}~@example.com",
  "δοκιμή@παράδειγμα.δοκιμή",
  "我買@屋企.香港",
  "二ノ宮@黒川.日本",
  "медведь@с-балалайкой.рф",
  "a@b.co",
  "A@B.CO",
  "a@B-C.Co",
  // invalid
  "",
  "invalidemail@",
  "invalid.com",
  "@invalid.com",
  "foo@bar.com.",
  "foo@bar.co.uk.",
  "somename@ｇｍａｉｌ.com",
  "z@co.c",
  "ｇｍａｉｌｇｍａｉｌ@gmail.com",
  `${"a".repeat(64)}@${"a".repeat(251)}.com`,
  `${"a".repeat(65)}@b.com`,
  `a@${"a".repeat(64)}.com`,
  "test1@invalid.co m",
  "test2@invalid.co m",
  "test3@invalid.co m",
  "test4@invalid.co m",
  "test5@invalid.co m",
  "test6@invalid.co m",
  "test7@invalid.co m",
  "test8@invalid.co m",
  "test9@invalid.co m",
  "test10@invalid.co m",
  "test11@invalid.co m",
  "test12@invalid.co　m",
  "test13@invalid.co m",
  "multiple..dots@stillinvalid.com",
  "test123+invalid! sub_address@gmail.com",
  "gmail...ignores...dots...@gmail.com",
  "ends.with.dot.@gmail.com",
  "multiple..dots@gmail.com",
  "wrong()[]\",:;<>@@gmail.com",
  "\"wrong()[]\",:;<>@@gmail.com",
  "username@domain.com�",
  "username@domain.com©",
  "nbsp test@test.com",
  "nbsp_test@te st.com",
  "nbsp_test@test.co m",
  "\"foobar@gmail.com",
  "\"foo\"bar\"@gmail.com",
  "foo\"bar\"@gmail.com",
  "\"@a.com",
  "\"\"@a.com",
  "a@b",
  "a@b.c",
  "a@b.c1",
  "a@b.123",
  "a@1.2.3.4",
  "a@[1.2.3.4]",
  "a@-b.com",
  "a@b-.com",
  "a@b_c.com",
  "a@b..com",
  "a@.b.com",
  "a.@b.com",
  ".a@b.com",
  "a@b.xn--",
  "a@b.xn-",
  "a@b.xn1",
  "a@b.XN--P1AI",
  "a b@c.com",
  "a@b.com ",
  " a@b.com",
  "a@b@c.com",
  "a@@b.com",
  "@",
  "@@",
  "a@b.c-m",
  "a@b.co-",
  `a@${label63}.${label63}.${label63}.co`,
  `a@${"a".repeat(64)}.co`,
  "a@b.c m",
  "a@b.　com",
  "a@b.co ",
  "a@b.ａｂ",
  "a@b.©©",
  "a@b.ª«",
  "a@b.c️o",
  // unpaired surrogates: validator throws, Megh rejects
  "\ud800@b.com",
  "a@b\udc00.com",
  "a\udfff@b.com",
  "a@b.com\ud800",
  "😀@b.com",
  "a@😀.com",
  `${"\ud800".repeat(200)}@b.com`,
  "x".repeat(255) + "\ud800",
  "\ud800" + "@" + "a".repeat(260),
];

describe("isEmail", () => {
  it.each(cases.map((c) => [c]))("matches validator for %j", (str) => {
    expectSame(str);
  });

  it("matches validator on 200,000 generated near-miss addresses", () => {
    let seed = 0xe3a11;
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const int = (n: number) => Math.floor(rand() * n);
    const pick = <T>(list: T[]): T => list[int(list.length)];
    const userChars = [
      ..."abcXYZ019!#$%&'*+-/=?^_`{|}~.\"\\ @()[],:;<>",
      "é",
      "端",
      " ",
      "　",
      "️",
      "😀",
      "\ud800",
      "\udc00",
      "\x01",
      "\x7f",
      "\t",
      "\n",
    ];
    const domainChars = [
      ..."abcxnXN0129-_.",
      "é",
      "©",
      "ª",
      " ",
      " ",
      " ",
      "　",
      "ａ",
      "～",
      "￯",
      "️",
      "😀",
      "\ud800",
      " ",
      "@",
    ];
    const tlds = [
      "com",
      "co",
      "c",
      "xn--p1ai",
      "xn-",
      "XN--abc",
      "123",
      "c1",
      "co m",
      "рф",
      "香港",
      "ａｂ",
      "",
      "a-",
      "-a",
    ];
    const piece = (chars: string[], max: number) => {
      let out = "";
      const n = int(max);
      for (let i = 0; i < n; i++) out += pick(chars);
      return out;
    };
    for (let i = 0; i < 200_000; i++) {
      let user = piece(userChars, 12);
      if (rand() < 0.15) user = `"${user}"`;
      if (rand() < 0.03) user = "a".repeat(60 + int(10));
      const labels = 1 + int(4);
      const parts: string[] = [];
      for (let j = 0; j < labels; j++) {
        parts.push(
          rand() < 0.05
            ? "a".repeat(60 + int(8))
            : piece(domainChars, 8) || pick(["a", "b1", "x-y"]),
        );
      }
      let domain = parts.join(".");
      if (rand() < 0.8) domain += "." + pick(tlds);
      if (rand() < 0.02) domain = "a".repeat(240 + int(20)) + ".com";
      const at = rand() < 0.9 ? "@" : pick(["", "@@", "@x@"]);
      expectSame(user + at + domain);
    }
  }, 60_000);

  it("matches validator on 50,000 random strings", () => {
    let seed = 0x7a5d0;
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 50_000; i++) {
      let s = "";
      const n = Math.floor(rand() * 20);
      for (let j = 0; j < n; j++) {
        const r = rand();
        s +=
          r < 0.5
            ? String.fromCharCode(32 + Math.floor(rand() * 95))
            : r < 0.6
              ? "@"
              : r < 0.7
                ? "."
                : String.fromCharCode(Math.floor(rand() * 0x10000));
      }
      expectSame(s);
    }
  }, 60_000);

  it("treats options that change nothing as defaults", () => {
    const same = [
      undefined,
      null,
      {},
      "x",
      { allow_utf8_local_part: true },
      { require_tld: true },
      { ignore_max_length: false },
      { host_blacklist: [], host_whitelist: [] },
      {
        allow_display_name: false,
        require_display_name: false,
        allow_underscores: false,
        blacklisted_chars: "",
      },
    ];
    for (const options of same) {
      expect(usesDefaultEmailOptions(options)).toBe(true);
      for (const str of cases) {
        const want = expected(() =>
          validatorIsEmail(
            str,
            options === null || typeof options !== "object"
              ? (options as any)
              : { ...options },
          ),
        );
        expect(outcome(() => isEmailDefault(str))).toBe(want);
      }
    }
  });

  it.each([
    [{ allow_display_name: true }],
    [{ require_display_name: true }],
    [{ allow_underscores: true }],
    [{ allow_utf8_local_part: false }],
    [{ require_tld: false }],
    [{ require_tld: null }],
    [{ blacklisted_chars: "+" }],
    [{ ignore_max_length: true }],
    [{ ignore_max_length: null }],
    [{ host_blacklist: ["a.com"] }],
    [{ host_whitelist: ["a.com"] }],
    [{ host_blacklist: null }],
    [{ domain_specific_validation: true }],
    [{ allow_ip_domain: true }],
  ])("passes %j to the validator package", (options) => {
    expect(usesDefaultEmailOptions(options)).toBe(false);
  });

  it("rejects unpaired surrogates instead of throwing", () => {
    for (const str of ["\ud800@b.com", "a@b\udc00.com", "a\udfff@b.com"]) {
      expect(() => validatorIsEmail(str)).toThrow(URIError);
      expect(isEmailDefault(str)).toBe(false);
    }
    class OptionsDto {
      @IsEmail({ allow_display_name: true }) from!: string;
    }
    const { errors } = validateDto(OptionsDto, { from: "\ud800@b.com" });
    expect(errors).toEqual([
      { path: "from", constraints: { isEmail: "from must be an email" } },
    ]);
  });

  it("@IsEmail with other options gives validator's answers", () => {
    class ContactDto {
      @IsEmail({ allow_display_name: true }) from!: string;
    }
    for (const from of [
      "Ada <ada@example.com>",
      "ada@example.com",
      "Ada <ada@example>",
      "<a@b.co>",
    ]) {
      const { errors } = validateDto(ContactDto, { from });
      expect(errors === null).toBe(
        validatorIsEmail(from, { allow_display_name: true }),
      );
    }
  });
});
