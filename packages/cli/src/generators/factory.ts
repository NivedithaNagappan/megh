import type { ResourceField } from "./resource";

/**
 * Renders a model factory for `make:factory`: one Faker call per column,
 * picked from the column's name and type (`email` → `faker.internet.email()`,
 * a `Date` → `faker.date.recent()`, …). Foreign keys use the related
 * model's factory when there is one.
 */

/** A foreign key column (`role_id`) and the factory that can fill it, if any. */
export interface ForeignKey {
  column: string;
  /** e.g. `RoleFactory`, when src/database/factories/role.factory.ts exists. */
  factory?: string;
  /** Import path of that factory, relative to the new factory file. */
  factoryImport?: string;
  /** Model name for the hint when there is no factory, e.g. `role`. */
  model: string;
}

const has = (name: string, pattern: RegExp) => pattern.test(name);

/** A Faker expression for a column, or `undefined` when none fits. */
export function fakeValue(field: ResourceField, model: string): string | undefined {
  const name = field.name.toLowerCase();
  const sql = (field.sqlType ?? "").toLowerCase();
  const length = Number(sql.match(/^n?(?:var)?char\((\d+)\)/)?.[1]) || undefined;

  if (field.ts === "boolean") return "faker.datatype.boolean()";

  if (field.ts === "Date") {
    if (has(name, /birth|born|dob/)) return "faker.date.birthdate()";
    if (has(name, /expire|expiry|due|until|ends?_|deadline|scheduled/)) return "faker.date.future()";
    return "faker.date.recent()";
  }

  if (field.ts === "number") {
    if (has(name, /price|amount|cost|total|balance|credit|debit|salary|fee|rate|latitude|longitude/) ||
      /^(decimal|numeric|real|float|double|money)/.test(sql)) {
      if (has(name, /latitude/)) return "faker.location.latitude()";
      if (has(name, /longitude/)) return "faker.location.longitude()";
      return "faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })";
    }
    if (has(name, /(^|_)age$/)) return "faker.number.int({ min: 18, max: 90 })";
    if (has(name, /year/)) return "faker.date.past({ years: 30 }).getFullYear()";
    if (has(name, /quantity|qty|count|stock/)) return "faker.number.int({ min: 0, max: 100 })";
    return "faker.number.int({ min: 1, max: 1000 })";
  }

  if (field.ts === "string") {
    const value = fakeString(name, sql, length, model);
    // Keep values within a short varchar(n): faker's can run longer.
    const fixed = /^faker\.string\.(uuid|alphanumeric)\(/.test(value);
    return length !== undefined && length < 60 && !fixed ? `${value}.slice(0, ${length})` : value;
  }

  if (field.ts.startsWith("Record<") || field.ts === "object") return "{}";
  return undefined;
}

function fakeString(name: string, sql: string, length: number | undefined, model: string): string {
  {
    if (has(name, /email/)) return "faker.internet.email()";
    if (has(name, /^first_?name$/)) return "faker.person.firstName()";
    if (has(name, /^last_?name$|surname/)) return "faker.person.lastName()";
    if (has(name, /user_?name|login|handle/)) return "faker.internet.username()";
    if (has(name, /password|secret/)) return "faker.internet.password()";
    if (has(name, /phone|mobile|tel/)) return 'faker.phone.number({ style: "international" })';
    if (has(name, /uuid|guid/) || sql === "uuid" || sql === "uniqueidentifier") return "faker.string.uuid()";
    if (has(name, /avatar/)) return "faker.image.avatar()";
    if (has(name, /image|photo|picture|thumbnail/)) return "faker.image.url()";
    if (has(name, /url|website|link|homepage/)) return "faker.internet.url()";
    if (has(name, /slug/)) return "faker.lorem.slug()";
    if (has(name, /street|address/)) return "faker.location.streetAddress()";
    if (has(name, /city|town/)) return "faker.location.city()";
    if (has(name, /country/)) return "faker.location.country()";
    if (has(name, /zip|postal|postcode/)) return "faker.location.zipCode()";
    if (has(name, /company|organi[sz]ation|employer/)) return "faker.company.name()";
    if (has(name, /job|position|occupation/)) return "faker.person.jobTitle()";
    if (has(name, /color|colour/)) return "faker.color.human()";
    if (has(name, /currency/)) return "faker.finance.currencyCode()";
    if (has(name, /(^|_)ip(_|$)|ip_?address/)) return "faker.internet.ip()";
    if (has(name, /(^|_)(code|sku|reference|ref)$/)) {
      return `faker.string.alphanumeric(${Math.min(length ?? 8, 8)}).toUpperCase()`;
    }
    if (has(name, /title|subject|headline/)) return "faker.lorem.sentence()";
    if (has(name, /description|body|content|bio|about|text|notes?|summary|message|comment/) ||
      /^(n?text|longtext|mediumtext)$/.test(sql)) {
      return "faker.lorem.paragraph()";
    }
    if (has(name, /(^|_)name$/) || name === "name") return nameFor(model);
    if (length !== undefined && length < 24) return `faker.string.alphanumeric(${Math.min(length, 10)})`;
    return "faker.lorem.words(3)";
  }
}

/** `name` means a person on a user, a word on a role, a product on a product… */
function nameFor(model: string): string {
  const m = model.toLowerCase();
  if (/role|category|tag|group|team|permission|status|type|label/.test(m)) return "faker.word.noun()";
  if (/product|item|article|good/.test(m)) return "faker.commerce.productName()";
  if (/company|organi[sz]ation|account|vendor|supplier|tenant|brand/.test(m)) return "faker.company.name()";
  if (/city|town/.test(m)) return "faker.location.city()";
  if (/country/.test(m)) return "faker.location.country()";
  return "faker.person.fullName()";
}

const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

export function renderFactory(opts: {
  model: string;
  modelImport: string;
  fields: ResourceField[];
  foreignKeys: ForeignKey[];
}): string {
  const fk = new Map(opts.foreignKeys.map((f) => [f.column, f]));
  const lines: string[] = [];
  const imports = new Map<string, string>(); // factory → import path
  for (const field of opts.fields) {
    const foreign = fk.get(field.name);
    if (foreign) {
      if (foreign.factory) {
        lines.push(`${key(field.name)}: ${foreign.factory},`);
        imports.set(foreign.factory, foreign.factoryImport!);
      } else if (field.nullable) {
        lines.push(`${key(field.name)}: null,`);
      } else {
        lines.push(`// ${key(field.name)}: ${pascal(foreign.model)}Factory, (create it: megh make:factory ${foreign.model})`);
      }
      continue;
    }
    const value = fakeValue(field, opts.model);
    if (value) lines.push(`${key(field.name)}: ${value},`);
    else lines.push(`// ${key(field.name)}: set a value (no fake value fits ${field.ts}),`);
  }
  const usesFaker = lines.some((l) => !l.startsWith("//") && l.includes("faker."));
  const header = [
    `import { defineFactory } from "@meghjs/core";`,
    `import { ${opts.model} } from "${opts.modelImport}";`,
    ...[...imports].map(([name, from]) => `import { ${name} } from "${from}";`),
  ];
  return (
    header.join("\n") +
    "\n\n" +
    `export const ${opts.model}Factory = defineFactory(${opts.model}, (${usesFaker ? "{ faker }" : ""}) => ({\n` +
    lines.map((l) => `  ${l}`).join("\n") +
    (lines.length ? "\n" : "") +
    `}));\n`
  );
}

const pascal = (snake: string) => snake.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase());
