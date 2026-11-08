import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runCli } from "../src/program";
import { makeModel, makeResource, updateModel } from "../src/generators/make";

let tmp: string;
let logs: string[];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "megh-update-model-"));
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x" }));
  logs = [];
  vi.spyOn(console, "log").mockImplementation((msg) => void logs.push(String(msg)));
  vi.spyOn(console, "warn").mockImplementation((msg) => void logs.push(String(msg)));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const migration = (name: string, source: string) => {
  const dir = path.join(tmp, "src", "database", "migrations");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), source);
};
const modelFile = () => path.join(tmp, "src", "models", "user.model.ts");
const readModel = () => fs.readFileSync(modelFile(), "utf8");

const CREATE_USERS = `import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("users", (table) => {
      table.id();
      table.string("email").unique();
      table.string("name");
      table.integer("age").nullable();
      table.timestamps();
    });
  },
  async down(schema) {
    await schema.drop("users");
  },
});
`;

const alter = (body: string) => `import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.table("users", (table) => {
      ${body}
    });
  },
  async down(schema) {
    await schema.table("users", (table) => {
      table.dropColumn("never_read");
    });
  },
});
`;

/** The model `make:model user` writes, plus code added by hand. */
function makeUserModel() {
  migration("20260101000000_create_users_table.ts", CREATE_USERS);
  makeModel("user", { cwd: tmp });
  const handWritten = readModel().replace(
    /\n\}\s*$/,
    `

  // Relations and helpers added by hand.
  posts = hasMany(() => Post);

  get label(): string {
    return this.name ?? this.email;
  }
}
`,
  );
  fs.writeFileSync(modelFile(), handWritten);
}

describe("update:model", () => {
  it("adds, removes and rewrites columns after an alter migration, keeping hand-written code", async () => {
    makeUserModel();
    migration(
      "20260102000000_alter_users_table.ts",
      alter(`table.string("phone", 20).nullable();
      table.boolean("is_active").default(true);
      table.dropColumn("age");
      table.renameColumn("name", "full_name");`),
    );

    expect(await runCli(["update:model", "user"], { cwd: tmp })).toBe(0);
    const model = readModel();

    expect(model).toContain("@Column() full_name!: string;");
    expect(model).toContain('@Column({ nullable: true, type: "string" }) phone!: string | null;');
    expect(model).toContain('@Column({ type: "boolean" }) is_active?: boolean;');
    expect(model).not.toMatch(/\bage\b/);
    expect(model).not.toMatch(/\bname!:/);
    // Hand-written code is untouched.
    expect(model).toContain("posts = hasMany(() => Post);");
    expect(model).toContain("return this.name ?? this.email;");
    // Columns follow migration order: new ones after the last existing column.
    const order = ["email", "full_name", "created_at", "updated_at", "phone", "is_active"].map((c) =>
      model.indexOf(` ${c}`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(logs.join("\n")).toMatch(/\+ phone[\s\S]*\+ is_active/);
    expect(logs.join("\n")).toMatch(/- age/);
  });

  it("keeps customized fields as written and reports them", async () => {
    makeUserModel();
    fs.writeFileSync(
      modelFile(),
      readModel().replace(
        "@Column() name!: string;",
        '/** Shown in the UI. */\n  @Column({ name: "name" }) displayName!: string;',
      ),
    );
    migration("20260102000000_alter_users_table.ts", alter(`table.dropColumn("age");`));
    // The column is now nullable in a later migration: the customized field is still kept.
    migration(
      "20260103000000_change_users_table.ts",
      alter(`table.dropColumn("name");
      table.string("name").nullable();`),
    );

    const changes = updateModel("user", { cwd: tmp });
    const model = readModel();
    expect(model).toContain('/** Shown in the UI. */\n  @Column({ name: "name" }) displayName!: string;');
    expect(changes.kept).toEqual(["name"]);
    expect(changes.removed).toEqual(["age"]);
    expect(logs.join("\n")).toMatch(/name has hand-made changes/);
  });

  it("removes a dropped column's doc comment and multi-line decorator", () => {
    makeUserModel();
    fs.writeFileSync(
      modelFile(),
      readModel().replace(
        "@Column({ nullable: true }) age!: number | null;",
        "/** Years. */\n  @Column({\n    nullable: true,\n  })\n  age!: number | null;",
      ),
    );
    migration("20260102000000_alter_users_table.ts", alter(`table.dropColumn("age");`));

    updateModel("user", { cwd: tmp });
    const model = readModel();
    expect(model).not.toContain("Years");
    expect(model).not.toContain("age");
    expect(model).toContain("@Column() name!: string;");
  });

  it("fixes the decorator imports", () => {
    migration(
      "20260101000000_create_users_table.ts",
      CREATE_USERS.replace("table.timestamps();", ""),
    );
    makeModel("user", { cwd: tmp });
    expect(readModel()).not.toContain("CreatedAt");
    migration(
      "20260102000000_alter_users_table.ts",
      alter(`table.timestamps();
      table.softDeletes();`),
    );

    updateModel("user", { cwd: tmp });
    const model = readModel();
    expect(model).toMatch(
      /import \{ AutoIncrement, Column, CreatedAt, DeletedAt, Model, PrimaryKey, Table, UpdatedAt \} from "@meghjs\/core";/,
    );
    expect(model).toContain("@DeletedAt() deleted_at?: Date | null;");
  });

  it("does nothing when the model already matches", () => {
    makeUserModel();
    const before = readModel();
    const changes = updateModel("user", { cwd: tmp });
    expect(readModel()).toBe(before);
    expect(changes).toEqual({ added: [], removed: [], updated: [], kept: [] });
    expect(logs.join("\n")).toMatch(/already matches the "users" table/);
  });

  it("--dry-run reports without writing", async () => {
    makeUserModel();
    const before = readModel();
    migration("20260102000000_alter_users_table.ts", alter(`table.string("phone").nullable();`));
    expect(await runCli(["u:m", "user", "--dry-run"], { cwd: tmp })).toBe(0);
    expect(readModel()).toBe(before);
    expect(logs.join("\n")).toMatch(/Would update[\s\S]*\+ phone/);
  });

  it("--dto rewrites the DTO; without it, points out the stale DTO", async () => {
    migration("20260101000000_create_users_table.ts", CREATE_USERS);
    makeResource("user", { cwd: tmp });
    const dto = path.join(tmp, "src", "dtos", "user.dto.ts");
    migration("20260102000000_alter_users_table.ts", alter(`table.string("phone").nullable();`));

    updateModel("user", { cwd: tmp });
    expect(fs.readFileSync(dto, "utf8")).not.toContain("phone");
    expect(logs.join("\n")).toMatch(/user\.dto\.ts may be out of date: rerun with --dto/);

    migration("20260103000000_alter_users_table.ts", alter(`table.dropColumn("age");`));
    expect(await runCli(["update:model", "user", "--dto"], { cwd: tmp })).toBe(0);
    const written = fs.readFileSync(dto, "utf8");
    expect(written).toContain("phone");
    expect(written).not.toMatch(/\bage\b/);
  });

  it("explains what to do for a missing model, a static model or a missing table", () => {
    expect(() => updateModel("user", { cwd: tmp })).toThrow(/Create it: megh make:model user/);

    fs.mkdirSync(path.dirname(modelFile()), { recursive: true });
    fs.writeFileSync(modelFile(), 'export class User extends Model {\n  static readonly table = "users";\n}\n');
    expect(() => updateModel("user", { cwd: tmp })).toThrow(/without decorators[\s\S]*make:model user --force/);

    fs.writeFileSync(modelFile(), '@Table("users")\nexport class User extends Model {\n}\n');
    expect(() => updateModel("user", { cwd: tmp })).toThrow(/No migration .* creates the "users" table/);
  });
});
