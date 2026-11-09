import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runCli } from "../src/program";
import { parseFieldList, parseFieldSpec } from "../src/templates/fields";
import {
  BUILTIN_DOMAINS,
  dependencies,
  findTemplate,
  orderByDependencies,
  templateForTable,
} from "../src/templates";
import { renderCreateMigration } from "../src/templates/migration";
import { readMigrationSchema } from "../src/generators/migration-schema";

describe("fields", () => {
  it("expands presets, with modifiers", () => {
    expect(parseFieldSpec("slug")).toEqual([{ name: "slug", type: "string", length: 255, unique: true }]);
    expect(parseFieldSpec("email:unique")[0]).toMatchObject({ name: "email", type: "string", unique: true });
    expect(parseFieldSpec("price?")[0]).toMatchObject({ type: "decimal", precision: 12, scale: 2, nullable: true });
  });

  it("expands groups, all nullable with ?", () => {
    const fields = parseFieldSpec("address?");
    expect(fields.map((f) => f.name)).toEqual([
      "address_line1",
      "address_line2",
      "city",
      "state",
      "postal_code",
      "country",
    ]);
    expect(fields.every((f) => f.nullable)).toBe(true);
  });

  it("reads explicit types, aliases and arguments", () => {
    expect(parseFieldSpec("nickname?:string(50)")).toEqual([
      { name: "nickname", type: "string", length: 50, nullable: true },
    ]);
    expect(parseFieldSpec("deposit:money")[0]).toMatchObject({ type: "decimal", precision: 12, scale: 2 });
    expect(parseFieldSpec("hours:decimal(5,1):default(0)")[0]).toMatchObject({ precision: 5, scale: 1, default: 0 });
  });

  it("makes foreign keys from _id names and foreign(table)", () => {
    expect(parseFieldSpec("category_id")[0]).toEqual({
      name: "category_id",
      type: "foreignId",
      references: { table: "categories" },
    });
    expect(parseFieldSpec("owner_id:foreign(users):cascade")[0].references).toEqual({
      table: "users",
      onDelete: "cascade",
    });
    expect(parseFieldSpec("brand_id:nullOnDelete")[0]).toMatchObject({
      nullable: true,
      references: { table: "brands", onDelete: "set null" },
    });
  });

  it("limits values with in(), defaulting the status preset to the first", () => {
    expect(parseFieldSpec("status:in(draft|published)")[0]).toMatchObject({
      type: "string",
      enum: ["draft", "published"],
      default: "draft",
    });
    expect(parseFieldSpec("kind:in(a|b)")[0]).toMatchObject({ type: "string", length: 32, enum: ["a", "b"] });
  });

  it("splits a --fields list outside parentheses", () => {
    expect(parseFieldList("title,price:decimal(10,2),status:in(a|b)").map((f) => f.name)).toEqual([
      "title",
      "price",
      "status",
    ]);
  });

  it("explains mistakes", () => {
    expect(() => parseFieldSpec("headline")).toThrow(/not a field preset.*headline:string/);
    expect(() => parseFieldSpec("x:varchar")).toThrow(/unknown type "varchar"/);
    expect(() => parseFieldSpec("title:cascade")).toThrow(/only applies to foreign keys/);
    expect(() => parseFieldSpec("Title")).toThrow(/snake_case/);
    expect(() => parseFieldSpec("key:string")).toThrow(/Model method/);
  });
});

describe("built-in catalog", () => {
  const templates = BUILTIN_DOMAINS.flatMap((d) => d.templates);

  it("has unique template names and tables within each domain", () => {
    for (const d of BUILTIN_DOMAINS) {
      expect(new Set(d.templates.map((t) => t.name)).size).toBe(d.templates.length);
      expect(new Set(d.templates.map((t) => t.table)).size).toBe(d.templates.length);
    }
  });

  it("resolves every foreign key to a template", () => {
    const missing = templates.flatMap((t) =>
      dependencies(t)
        .filter((table) => !templateForTable([...BUILTIN_DOMAINS], table, t.domain))
        .map((table) => `${t.domain}/${t.name} → ${table}`),
    );
    expect(missing).toEqual([]);
  });

  it("orders each domain's tables without cycles", () => {
    for (const d of BUILTIN_DOMAINS) {
      const items = d.templates.map((t) => ({ template: t, table: t.table }));
      const ordered = orderByDependencies(items).map((i) => i.table);
      for (const t of d.templates) {
        for (const dep of dependencies(t).filter((x) => ordered.includes(x))) {
          expect(ordered.indexOf(dep)).toBeLessThan(ordered.indexOf(t.table));
        }
      }
    }
  });

  it("writes migrations the schema reader reads back", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "megh-catalog-"));
    try {
      templates.forEach((t, i) => {
        const file = path.join(dir, `${String(i).padStart(4, "0")}_${t.domain}_${t.table}.ts`);
        fs.writeFileSync(file, renderCreateMigration(t));
        const read = readMigrationSchema(dir).get(t.table)!;
        const expected = [
          ...(t.pivot ? [] : ["id"]),
          ...t.fields.map((f) => f.name),
          ...(t.timestamps ? ["created_at", "updated_at"] : []),
          ...(t.softDeletes ? ["deleted_at"] : []),
        ];
        expect(read.columns.map((c) => c.name), `${t.domain}/${t.name}`).toEqual(expected);
        for (const f of t.fields) {
          const column = read.columns.find((c) => c.name === f.name)!;
          expect(column.notNull, `${t.domain}/${t.name}.${f.name}`).toBe(!f.nullable);
        }
        fs.rmSync(file);
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds templates by domain/name, or by a bare name", () => {
    const domains = [...BUILTIN_DOMAINS];
    expect(findTemplate(domains, "ecommerce/product").domain).toBe("ecommerce");
    expect(findTemplate(domains, "category").domain).toBe("common");
    expect(findTemplate(domains, "real-estate/rent-payment").table).toBe("rent_payments");
    expect(() => findTemplate(domains, "product")).toThrow(/several domains: ecommerce\/product, pos\/product/);
    expect(() => findTemplate(domains, "ecommerce/nope")).toThrow(/has no "nope" template/);
  });
});

describe("make:model --template, make:resource --template, scaffold:domain", () => {
  let tmp: string;
  const read = (...p: string[]) => fs.readFileSync(path.join(tmp, ...p), "utf8");
  const exists = (...p: string[]) => fs.existsSync(path.join(tmp, ...p));
  const migrations = () => fs.readdirSync(path.join(tmp, "src/database/migrations")).sort();
  const run = (...args: string[]) => runCli(args, { cwd: tmp });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "megh-templates-"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x" }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates the table, the tables its foreign keys need, then the models", async () => {
    expect(await run("make:model", "Product", "--template", "ecommerce/product", "-y")).toBe(0);
    const files = migrations();
    expect(files.map((f) => f.replace(/^\d+_/, ""))).toEqual([
      "create_categories_table.ts",
      "create_brands_table.ts",
      "create_products_table.ts",
    ]);
    const products = read("src/database/migrations", files[2]);
    expect(products).toContain('table.foreignId("category_id").constrained("categories").nullOnDelete();');
    expect(products).toContain('table.string("status", 32).default("draft"); // draft | active | archived');
    expect(products).toContain("table.softDeletes();");
    expect(products).toContain('table.index("status");');

    const model = read("src/models/product.model.ts");
    expect(model).toContain('@Table("products")');
    expect(model).toMatch(/price!: number;/);
    expect(model).toMatch(/description!: string \| null;/);
    expect(exists("src/models/category.model.ts")).toBe(true);
    expect(exists("src/models/brand.model.ts")).toBe(true);
  });

  it("adds --fields to a template, and skips dependencies with --no-deps", async () => {
    expect(
      await run("make:model", "Brand", "--template", "ecommerce/brand", "--fields", "country?:string(100),name:string(80)", "-y", "--no-deps"),
    ).toBe(0);
    expect(migrations()).toHaveLength(1);
    const source = read("src/database/migrations", migrations()[0]);
    expect(source).toContain('table.string("name", 80);');
    expect(source).toContain('table.string("country", 100).nullable();');
  });

  it("builds a table from --fields alone, with a resource and a factory", async () => {
    expect(
      await run("make:resource", "Ticket", "--fields", "title,body,status:in(open|closed),user_id:cascade", "--factory", "-y"),
    ).toBe(0);
    expect(migrations().map((f) => f.replace(/^\d+_/, ""))).toEqual(["create_users_table.ts", "create_tickets_table.ts"]);
    for (const file of [
      "src/models/ticket.model.ts",
      "src/models/user.model.ts",
      "src/dtos/ticket.dto.ts",
      "src/services/ticket.service.ts",
      "src/controllers/ticket.controller.ts",
      "src/database/factories/ticket.factory.ts",
      "src/database/factories/user.factory.ts",
    ]) {
      expect(exists(file), file).toBe(true);
    }
    // The user's own resource is not generated, only its model.
    expect(exists("src/controllers/user.controller.ts")).toBe(false);
    expect(read("src/database/factories/ticket.factory.ts")).toContain("user_id: UserFactory,");
  });

  it("keeps an existing migration and model", async () => {
    await run("make:model", "Category", "--template", "category", "-y");
    const before = migrations();
    expect(await run("make:model", "Product", "--template", "ecommerce/product", "-y")).toBe(0);
    expect(migrations().filter((f) => f.includes("categories"))).toEqual(before);
    // Asking for an existing model again fails without --force.
    expect(await run("make:model", "Category", "--template", "category", "-y")).toBe(1);
  });

  it("scaffolds a domain: every template, join tables without models", async () => {
    expect(await run("scaffold:domain", "ecommerce", "-y", "--resource")).toBe(0);
    const names = migrations().map((f) => f.replace(/^\d+_create_|_table\.ts$/g, ""));
    expect(names).toContain("product_tags");
    expect(names).toContain("tags"); // from common, for product_tags
    expect(names).toContain("users"); // from common, for customers
    expect(names.indexOf("orders")).toBeGreaterThan(names.indexOf("coupons"));
    expect(names.indexOf("order_items")).toBeGreaterThan(names.indexOf("orders"));
    expect(exists("src/controllers/order-item.controller.ts")).toBe(true);
    expect(exists("src/models/product-tag.model.ts")).toBe(false);
    expect(exists("src/models/tag.model.ts")).toBe(true);
    expect(exists("src/controllers/tag.controller.ts")).toBe(false);
    expect(new Set(migrations().map((f) => f.slice(0, 14))).size).toBe(migrations().length);
  });

  it("scaffolds only some templates of a domain", async () => {
    expect(await run("scaffold:domain", "pos", "--only", "outlet,register", "--migrations-only", "-y")).toBe(0);
    expect(migrations().map((f) => f.replace(/^\d+_/, ""))).toEqual([
      "create_outlets_table.ts",
      "create_registers_table.ts",
    ]);
    expect(exists("src/models")).toBe(false);
  });

  it("uses project templates from .megh/templates", async () => {
    fs.mkdirSync(path.join(tmp, ".megh/templates"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".megh/templates/helpdesk.json"),
      JSON.stringify({
        description: "Support tickets",
        templates: [{ name: "ticket", fields: ["title", "status:in(open|closed)"], softDeletes: true }],
      }),
    );
    expect(await run("make:model", "Ticket", "--template", "helpdesk/ticket", "-y")).toBe(0);
    const source = read("src/database/migrations", migrations()[0]);
    expect(source).toContain('table.string("status", 32).default("open"); // open | closed');
    expect(source).toContain("table.softDeletes();");
  });

  it("numbers new migrations after the newest existing one", async () => {
    fs.mkdirSync(path.join(tmp, "src/database/migrations"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "src/database/migrations/20991231235959_create_notes_table.ts"),
      "export default {};\n",
    );
    expect(await run("make:model", "Product", "--template", "ecommerce/product", "-y")).toBe(0);
    expect(migrations().map((f) => f.slice(0, 14))).toEqual([
      "20991231235959",
      "21000101000000",
      "21000101000001",
      "21000101000002",
    ]);
  });

  it("rejects an unknown template or domain", async () => {
    expect(await run("make:model", "X", "--template", "nope/x", "-y")).toBe(1);
    expect(await run("scaffold:domain", "nope", "-y")).toBe(1);
    expect(exists("src/database")).toBe(false);
  });
});
