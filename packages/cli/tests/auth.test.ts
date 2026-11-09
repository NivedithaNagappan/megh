import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runCli } from "../src/program";

let tmp: string;
const read = (...p: string[]) => fs.readFileSync(path.join(tmp, ...p), "utf8");
const exists = (...p: string[]) => fs.existsSync(path.join(tmp, ...p));
const write = (rel: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
  fs.writeFileSync(path.join(tmp, rel), content);
};
const migrations = () => fs.readdirSync(path.join(tmp, "src/database/migrations")).sort().map((f) => f.slice(15));
const run = (...args: string[]) => runCli(args, { cwd: tmp });

const APP = `import { Megh } from '@meghjs/core';
import { HomeController } from './controllers/home.controller';

const app = Megh.createApplication();

app.useMeghORM();

app.useControllers([HomeController]);

export default app;
`;

const ENTRY_SEEDER = `import { defineSeeder } from "@meghjs/core";

// \`megh db:seed\` runs this seeder. Call the others from here, in order.
export default defineSeeder({
  async run() {
    // Add { call } to run()'s parameters, then: await call("roles", "users");
  },
});
`;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "megh-auth-"));
  write("package.json", JSON.stringify({ name: "x" }));
  write("src/app.ts", APP);
  write(".env", "PORT=4000\n");
  write(
    "src/config/openapi.config.ts",
    "export const config = {\n  info: { title: 'x', version: '1' },\n  routePrefix: '/docs',\n};\n",
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("scaffold:auth", () => {
  it("JWT and API keys with roles and permissions", async () => {
    write("src/database/seeders/database.seeder.ts", ENTRY_SEEDER);
    expect(await run("scaffold:auth", "--strategy", "both", "--roles", "multiple", "--permissions", "-y")).toBe(0);

    expect(migrations()).toEqual([
      "create_users_table.ts",
      "create_roles_table.ts",
      "create_permissions_table.ts",
      "create_role_permissions_table.ts",
      "create_user_roles_table.ts",
      "create_api_keys_table.ts",
    ]);
    for (const f of [
      "src/auth/password.ts",
      "src/auth/jwt.ts",
      "src/auth/api-keys.ts",
      "src/auth/authentication.ts",
      "src/auth/authorization.ts",
      "src/auth/rbac.ts",
      "src/dtos/auth.dto.ts",
      "src/services/auth.service.ts",
      "src/controllers/auth.controller.ts",
      "src/database/seeders/roles.seeder.ts",
      "src/models/user.model.ts",
      "src/models/role.model.ts",
      "src/models/permission.model.ts",
      "src/models/api-key.model.ts",
    ]) {
      expect(exists(f), f).toBe(true);
    }

    const user = read("src/models/user.model.ts");
    expect(user).toContain('@BelongsToMany(() => Role, { table: "user_roles" })');
    expect(user).toContain('import { Role } from "./role.model";');
    expect(user).toContain("delete json.password;");
    expect(read("src/models/role.model.ts")).toContain('@BelongsToMany(() => Permission, { table: "role_permissions" })');
    expect(read("src/models/api-key.model.ts")).toContain("delete json.key_hash;");

    expect(read("src/auth/authentication.ts")).toContain('User.with("roles.permissions")');
    expect(read("src/auth/authorization.ts")).toContain("hasPermission(user, options.permissions)");

    const app = read("src/app.ts");
    expect(app).toContain("import { AppAuthentication } from './auth/authentication';");
    expect(app).toContain("app.useAuthentication(AppAuthentication);\napp.useAuthorization(AppAuthorization);\n\napp.useControllers");
    expect(app).toContain("app.useControllers([HomeController, AuthController]);");

    expect(read(".env")).toMatch(/^JWT_SECRET=[0-9a-f]{96}$/m);
    expect(read(".env")).toContain("JWT_EXPIRES_IN=1d");
    expect(read("src/config/openapi.config.ts")).toContain("  routePrefix: '/docs',\n  auth: 'bearer',");
    expect(read("src/database/seeders/database.seeder.ts")).toContain('async run({ call }) {\n    await call("roles");');
  });

  it("JWT only, no roles: no RBAC files or tables", async () => {
    expect(await run("scaffold:auth", "--strategy", "jwt", "-y")).toBe(0);
    expect(migrations()).toEqual(["create_users_table.ts"]);
    expect(exists("src/auth/rbac.ts")).toBe(false);
    expect(exists("src/auth/api-keys.ts")).toBe(false);
    expect(read("src/auth/authorization.ts")).not.toContain("roles");
    expect(read("src/auth/authentication.ts")).toContain('User.where("id", id).first()');
  });

  it("API keys with a single role: users.role_id, login returns an API key", async () => {
    expect(await run("scaffold:auth", "--strategy", "api-key", "--roles", "single", "--no-permissions", "-y")).toBe(0);
    expect(migrations()).toEqual(["create_roles_table.ts", "create_users_table.ts", "create_api_keys_table.ts"]);
    expect(read("src/database/migrations", fs.readdirSync(path.join(tmp, "src/database/migrations")).sort()[1])).toContain(
      'table.foreignId("role_id").constrained("roles").nullOnDelete();',
    );
    expect(read("src/models/user.model.ts")).toContain("@BelongsTo(() => Role)");
    expect(read("src/services/auth.service.ts")).toContain("return { api_key: key, user };");
    expect(read("src/config/openapi.config.ts")).toContain("auth: 'apiKey'");
    expect(exists("src/auth/jwt.ts")).toBe(false);
    expect(read(".env")).not.toContain("JWT_SECRET");
  });

  it("adds the missing columns to an existing users table", async () => {
    await run("make:model", "User", "--fields", "name,email:unique", "-y");
    expect(await run("scaffold:auth", "--strategy", "jwt", "--roles", "single", "-y")).toBe(0);
    const files = migrations();
    expect(files[0]).toBe("create_users_table.ts");
    expect(files).toContain("add_auth_columns_to_users_table.ts");
    expect(files.indexOf("create_roles_table.ts")).toBeLessThan(files.indexOf("add_auth_columns_to_users_table.ts"));
    const alter = read(
      "src/database/migrations",
      fs.readdirSync(path.join(tmp, "src/database/migrations")).find((f) => f.includes("add_auth_columns"))!,
    );
    expect(alter).toContain('table.string("password").nullable();');
    expect(alter).toContain('table.foreignId("role_id").constrained("roles").nullOnDelete();');
    expect(alter).toContain('table.dropColumn("password", "role_id");');
    expect(read("src/models/user.model.ts")).toMatch(/password!: string \| null;/);
    // Columns the existing table lacks are not used.
    expect(read("src/services/auth.service.ts")).not.toContain("last_login_at");
  });

  it("refuses to overwrite auth files, and runs again with --force", async () => {
    await run("scaffold:auth", "--strategy", "jwt", "-y");
    expect(await run("scaffold:auth", "--strategy", "both", "-y")).toBe(1);
    expect(exists("src/auth/api-keys.ts")).toBe(false);
    expect(await run("scaffold:auth", "--strategy", "both", "-y", "-f")).toBe(0);
    expect(exists("src/auth/api-keys.ts")).toBe(true);
    // Nothing is registered twice.
    expect(read("src/app.ts").match(/useAuthentication/g)).toHaveLength(1);
    expect(read(".env").match(/JWT_SECRET/g)).toHaveLength(1);
  });

  it("rejects unknown options", async () => {
    expect(await run("scaffold:auth", "--strategy", "oauth", "-y")).toBe(1);
    expect(await run("scaffold:auth", "--roles", "many", "-y")).toBe(1);
  });
});

describe("scaffold:rbac", () => {
  it("adds roles to existing users, without sign-in", async () => {
    await run("make:model", "User", "--template", "user", "-y");
    expect(await run("scaffold:rbac", "--roles", "multiple", "--permissions", "-y")).toBe(0);
    expect(exists("src/controllers/auth.controller.ts")).toBe(false);
    expect(exists("src/auth/authentication.ts")).toBe(false);
    expect(read("src/models/user.model.ts")).toContain("@BelongsToMany(() => Role");
    const app = read("src/app.ts");
    expect(app).toContain("app.useAuthorization(AppAuthorization);");
    expect(app).not.toContain("useAuthentication");
  });

  it("is reused as is by a later scaffold:auth with the same roles", async () => {
    await run("scaffold:rbac", "--roles", "multiple", "--no-permissions", "-y");
    const rbac = read("src/auth/rbac.ts");
    expect(await run("scaffold:auth", "--strategy", "jwt", "--roles", "multiple", "--no-permissions", "-y")).toBe(0);
    expect(read("src/auth/rbac.ts")).toBe(rbac);
    expect(migrations().filter((f) => f.includes("roles"))).toEqual(["create_roles_table.ts", "create_user_roles_table.ts"]);
  });

  it("needs roles", async () => {
    expect(await run("scaffold:rbac", "--roles", "none", "-y")).toBe(1);
  });
});
