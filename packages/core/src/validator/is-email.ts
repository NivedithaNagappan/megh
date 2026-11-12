/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * `isEmail` with the same answers as the `validator` package's `isEmail`
 * (13.x), which class-validator's `@IsEmail` calls.
 *
 * With default options (`@IsEmail()`, `@IsEmail({})`) this file does the work
 * itself: ASCII input is checked with plain character loops, anything else
 * with `validator`'s own regular expressions. Other options are passed to the
 * `validator` package unchanged.
 *
 * One deliberate difference: an address with an unpaired UTF-16 surrogate is
 * rejected. `validator` throws `URIError` for it (its byte count uses
 * `encodeURI`), which would turn a bad request body into a 500.
 */

const quotedEmailUserUtf8 =
  /^([\s\x01-\x08\x0b\x0c\x0e-\x1f\x7f\x21\x23-\x5b\x5d-\x7e -퟿豈-﷏ﷰ-￯]|(\\[\x01-\x09\x0b\x0c\x0d-\x7f -퟿豈-﷏ﷰ-￯]))*$/i;
const emailUserUtf8Part = /^[a-z\d!#\$%&'\*\+\-\/=\?\^_`{\|}~¡-퟿豈-﷏ﷰ-￯]+$/i;
const tldPattern = /^([a-z¡-¨ª-퟿豈-﷏ﷰ-￯]{2,}|xn[a-z0-9-]{2,})$/i;
const fqdnPartPattern = /^[a-z_¡-￿0-9-]+$/i;

const MAX_EMAIL_LENGTH = 254;

/**
 * Do these options make `validator`'s `isEmail` behave as with no options?
 * Mirrors how each option is read there (some truthy, some `=== false`).
 */
export function usesDefaultEmailOptions(options: any): boolean {
  if (
    options === undefined ||
    options === null ||
    typeof options !== "object"
  ) {
    return true;
  }
  const emptyList = (list: any) =>
    list === undefined || (Array.isArray(list) && list.length === 0);
  return (
    !options.allow_display_name &&
    !options.require_display_name &&
    !options.allow_underscores &&
    (options.allow_utf8_local_part === undefined ||
      !!options.allow_utf8_local_part) &&
    (options.require_tld === undefined || !!options.require_tld) &&
    !options.blacklisted_chars &&
    (options.ignore_max_length === undefined ||
      options.ignore_max_length === false) &&
    emptyList(options.host_blacklist) &&
    emptyList(options.host_whitelist) &&
    !options.domain_specific_validation &&
    !options.allow_ip_domain
  );
}

/**
 * UTF-8 byte length, as `encodeURI(str).split(/%..|./).length - 1` counts it,
 * or `Infinity` for an unpaired surrogate (where `encodeURI` throws).
 */
function utf8Length(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = str.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return Infinity;
      bytes += 4;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return Infinity;
    } else bytes += 3;
  }
  return bytes;
}

function isAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++)
    if (str.charCodeAt(i) > 0x7f) return false;
  return true;
}

const isAlpha = (c: number) =>
  (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a);
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;

/** Characters `emailUserUtf8Part` allows in ASCII: letters, digits, !#$%&'*+-/=?^_`{|}~ */
const USER_CHARS = new Uint8Array(128);
for (const ch of "!#$%&'*+-/=?^_`{|}~") USER_CHARS[ch.charCodeAt(0)] = 1;
for (let c = 0; c < 128; c++) if (isAlpha(c) || isDigit(c)) USER_CHARS[c] = 1;

/** ASCII local part: dot-separated, every part non-empty and made of USER_CHARS. */
function isAsciiUser(user: string): boolean {
  let partLength = 0;
  for (let i = 0; i < user.length; i++) {
    const c = user.charCodeAt(i);
    if (c === 0x2e) {
      if (partLength === 0) return false;
      partLength = 0;
    } else if (USER_CHARS[c]) partLength++;
    else return false;
  }
  return partLength > 0;
}

/**
 * ASCII `isFQDN(domain, { require_tld: true, allow_underscores: false })`:
 * two or more labels of letters, digits and inner hyphens, at most 63 long,
 * the last alphabetic (2+) or `xn` followed by 2+ letters, digits or hyphens.
 */
function isAsciiFqdn(domain: string): boolean {
  let labels = 0;
  let start = 0;
  for (let i = 0; i <= domain.length; i++) {
    if (i < domain.length && domain.charCodeAt(i) !== 0x2e) continue;
    const length = i - start;
    if (length === 0 || length > 63) return false;
    if (domain.charCodeAt(start) === 0x2d || domain.charCodeAt(i - 1) === 0x2d)
      return false;
    for (let j = start; j < i; j++) {
      const c = domain.charCodeAt(j);
      if (!isAlpha(c) && !isDigit(c) && c !== 0x2d) return false;
    }
    labels++;
    if (i === domain.length) {
      // The last label is the TLD.
      if (labels < 2) return false;
      let alpha = length >= 2;
      for (let j = start; j < i && alpha; j++)
        alpha = isAlpha(domain.charCodeAt(j));
      if (!alpha) {
        const x = domain.charCodeAt(start) | 0x20;
        const n = domain.charCodeAt(start + 1) | 0x20;
        // `xn` + 2 or more of [a-z0-9-]; the label loop already checked the characters.
        if (!(x === 0x78 && n === 0x6e && length >= 4)) return false;
      }
    }
    start = i + 1;
  }
  return true;
}

/** `validator`'s `isFQDN` with the options `isEmail` passes by default. */
function isFqdnRegex(domain: string): boolean {
  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  if (parts.length < 2) return false;
  if (!tldPattern.test(tld)) return false;
  if (/\s/.test(tld)) return false;
  if (/^\d+$/.test(tld)) return false;
  return parts.every((part) => {
    if (part.length > 63) return false;
    if (!fqdnPartPattern.test(part)) return false;
    if (/[！-～]/.test(part)) return false;
    if (/^-|-$/.test(part)) return false;
    if (/_/.test(part)) return false;
    return true;
  });
}

/** `validator`'s `isEmail(str)` with default options. */
export function isEmailDefault(str: string): boolean {
  if (str.length > MAX_EMAIL_LENGTH) return false;
  const at = str.lastIndexOf("@");
  const domain = at === -1 ? str : str.slice(at + 1);
  let user = at === -1 ? "" : str.slice(0, at);

  if (utf8Length(user) > 64 || utf8Length(domain) > 254) return false;

  const ascii = isAscii(domain);
  if (!(ascii ? isAsciiFqdn(domain) : isFqdnRegex(domain))) return false;

  if (user[0] === "\"" && user[user.length - 1] === "\"") {
    user = user.slice(1, user.length - 1);
    return quotedEmailUserUtf8.test(user);
  }
  if (isAscii(user)) return isAsciiUser(user);
  const parts = user.split(".");
  for (let i = 0; i < parts.length; i++) {
    if (!emailUserUtf8Part.test(parts[i])) return false;
  }
  return true;
}
