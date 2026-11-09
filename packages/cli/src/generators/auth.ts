import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CliError } from "../errors";
import { databasePaths } from "../commands/migrate";
import { log } from "../utils/log";
import { installedVersion, requireProjectRoot, writeFileSafe } from "../utils/project";
import { generatedFiles, makeModel, migrationTimestamp, updateModel } from "./make";
import { readMigrationSchema } from "./migration-schema";
import { firstFreeTimestamp, scaffold, type Target } from "./scaffold";
import { allDomains, findTemplate, type ModelTemplate } from "../templates";
import { parseFieldSpec, type FieldDef } from "../templates/fields";
import { renderColumn } from "../templates/migration";
import {
  renderApiKeys,
  renderAuthController,
  renderAuthDto,
  renderAuthentication,
  renderAuthorization,
  renderAuthService,
  renderJwt,
  renderPassword,
  renderRbac,
  renderRolesSeeder,
  usesApiKeys,
  usesJwt,
  usesRoles,
  type AuthChoice,
  type AuthPlan,
  type AuthStrategy,
  type Paths,
  type RoleMode,
} from "./auth-files";

export type { AuthStrategy, RoleMode } from "./auth-files";
export const AUTH_STRATEGIES: readonly AuthStrategy[] = ["jwt", "api-key", "both"];
export const ROLE_MODES: readonly RoleMode[] = ["none", "single", "multiple"];

export type AuthOptions = {
  cwd?: string;
  /** scaffold:auth only. Prompted for when missing in a terminal; default `jwt`. */
  strategy?: string;
  /** Prompted for when missing in a terminal; default `none` for scaffold:auth, `multiple` for scaffold:rbac. */
  roles?: string;
  /** Roles grant permissions. Prompted for when missing in a terminal. */
  permissions?: boolean;
  /** Overwrite generated auth files that already exist. */
  force?: boolean;
  /** Prompt when run in a terminal. */
  interactive?: boolean;
  /** Clock for migration timestamps (tests). */
  now?: Date;
};

const relPath = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");

const paths: Paths = {
  rel(from, to) {
    let rel = path.posix.relative(path.posix.dirname(from), to).replace(/\.ts$/, "");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  },
};

const isInteractive = (o: AuthOptions) =>
  o.interactive === true && process.stdin.isTTY === true && process.stdout.isTTY === true;

async function ask(opts: AuthOptions, withStrategy: boolean, defaultRoles: RoleMode) {
  let strategy = opts.strategy as AuthStrategy | undefined;
  let roles = opts.roles as RoleMode | undefined;
  let permissions = opts.permissions;
  if (strategy !== undefined && !AUTH_STRATEGIES.includes(strategy)) {
    throw new CliError(`Unknown strategy "${strategy}". Choose from: ${AUTH_STRATEGIES.join(", ")}.`);
  }
  if (roles !== undefined && !ROLE_MODES.includes(roles)) {
    throw new CliError(`Unknown --roles "${roles}". Choose from: ${ROLE_MODES.join(", ")}.`);
  }
  if (isInteractive(opts)) {
    const prompt = (await import("inquirer")).default;
    if (withStrategy && !strategy) {
      ({ strategy } = await prompt.prompt([
        {
          type: "list",
          name: "strategy",
          message: "How do clients sign in?",
          choices: [
            { name: "JWT: POST /auth/login returns a Bearer token", value: "jwt" },
            { name: "API keys: X-API-Key header, keys created per user", value: "api-key" },
            { name: "Both: Bearer tokens and API keys", value: "both" },
          ],
          default: "jwt",
        },
      ]));
    }
    if (!roles) {
      ({ roles } = await prompt.prompt([
        {
          type: "list",
          name: "roles",
          message: "Roles (RBAC):",
          choices: [
            { name: "None", value: "none" },
            { name: "Single: one role per user (users.role_id)", value: "single" },
            { name: "Multiple: any number of roles per user (user_roles)", value: "multiple" },
          ],
          default: defaultRoles,
        },
      ]));
    }
    if (roles !== "none" && permissions === undefined) {
      ({ permissions } = await prompt.prompt([
        { type: "confirm", name: "permissions", message: "Should roles grant permissions?", default: true },
      ]));
    }
  }
  roles ??= defaultRoles;
  return {
    strategy: withStrategy ? (strategy ?? "jwt") : undefined,
    roles,
    permissions: roles !== "none" && permissions === true,
  };
}

/** Tables the plan needs, as templates. */
function tableTemplates(projectRoot: string, plan: AuthChoice): { users: ModelTemplate; others: ModelTemplate[] } {
  const domains = allDomains(projectRoot);
  const t = (name: string) => findTemplate(domains, `common/${name}`);
  let users = t("user");
  if (plan.roles === "single") users = { ...users, fields: [...users.fields, ...parseFieldSpec("role_id:nullOnDelete")] };
  const others: ModelTemplate[] = [];
  if (usesRoles(plan)) others.push(t("role"));
  if (plan.permissions) others.push(t("permission"), t("role_permission"));
  if (plan.roles === "multiple") others.push(t("user_role"));
  if (usesApiKeys(plan)) others.push(t("api_key"));
  return { users, others };
}

/** Columns the users table needs for this plan. */
function requiredUserColumns(plan: AuthChoice, users: ModelTemplate): FieldDef[] {
  const names = [...(plan.strategy ? ["email", "password"] : []), ...(plan.roles === "single" ? ["role_id"] : [])];
  return users.fields.filter((f) => names.includes(f.name));
}

/** `schema.table("users", ...)` adding columns to an existing table. They are nullable: the table may have rows. */
function renderAlterMigration(table: string, fields: FieldDef[]): string {
  const add = fields.map((f) => `      ${renderColumn({ ...f, nullable: true })}`).join("\n");
  return `import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.table(${JSON.stringify(table)}, (table) => {
${add}
    });
  },

  async down(schema) {
    await schema.table(${JSON.stringify(table)}, (table) => {
      table.dropColumn(${fields.map((f) => JSON.stringify(f.name)).join(", ")});
    });
  },
});
`;
}

type ModelPatch = {
  /** Names to import from @meghjs/core. */
  core?: string[];
  /** Other import lines. */
  imports?: string[];
  /** Class members, each added when `has` does not match the source. */
  members: { has: RegExp; code: string }[];
};

/** Add relations / methods to a generated model. Returns whether it changed. */
function patchModel(projectRoot: string, file: string, patch: ModelPatch): boolean {
  const rel = relPath(projectRoot, file);
  if (!fs.existsSync(file)) return false;
  let source = fs.readFileSync(file, "utf8");
  const members = patch.members.filter((m) => !m.has.test(source));
  if (!members.length) return false;
  if (!/@Table\s*\(/.test(source) || !/\n}\s*$/.test(source)) {
    log.warn(`${rel} is not a decorated Megh ORM model, so add these by hand:\n${members.map((m) => m.code).join("\n")}`);
    return false;
  }
  const coreImport = /import\s*\{([^}]*)\}\s*from\s*(["'])@meghjs\/core\2;?/;
  const match = source.match(coreImport);
  if (patch.core?.length) {
    if (match) {
      const names = new Set(match[1].split(",").map((s) => s.trim()).filter(Boolean));
      for (const n of patch.core) names.add(n);
      source = source.replace(coreImport, `import { ${[...names].sort().join(", ")} } from ${match[2]}@meghjs/core${match[2]};`);
    } else {
      source = `import { ${patch.core.join(", ")} } from "@meghjs/core";\n` + source;
    }
  }
  for (const line of patch.imports ?? []) {
    if (source.includes(line)) continue;
    const at = source.match(coreImport);
    source = at ? source.replace(at[0], `${at[0]}\n${line}`) : `${line}\n${source}`;
  }
  const end = source.lastIndexOf("}");
  source = `${source.slice(0, end).trimEnd()}\n\n${members.map((m) => m.code).join("\n\n")}\n}\n`;
  fs.writeFileSync(file, source, "utf8");
  log.success(`Model updated: ${rel}`);
  return true;
}

const hideColumns = (columns: string[]) => ({
  has: /\btoJSON\s*\(/,
  code: [
    `  /** Never send ${columns.join(" or ")} in responses. */`,
    `  toJSON(): Record<string, unknown> {`,
    `    const json = super.toJSON();`,
    ...columns.map((c) => `    delete json.${c};`),
    `    return json;`,
    `  }`,
  ].join("\n"),
});

function patchModels(projectRoot: string, plan: AuthPlan) {
  const files = (name: string) => generatedFiles(projectRoot, name).model;
  const hidden = ["password", "remember_token"].filter((c) => plan.userColumns.has(c));
  const userMembers: ModelPatch["members"] = [];
  const core: string[] = [];
  const imports: string[] = [];
  if (plan.roles === "multiple") {
    core.push("BelongsToMany");
    imports.push(`import { Role } from "./role.model";`);
    userMembers.push({
      has: /\broles\s*[!?]?\s*:/,
      code: `  @BelongsToMany(() => Role, { table: "user_roles" })\n  roles!: BelongsToMany<Role>;`,
    });
  } else if (plan.roles === "single") {
    core.push("BelongsTo");
    imports.push(`import { Role } from "./role.model";`);
    userMembers.push({ has: /\brole\s*[!?]?\s*:/, code: `  @BelongsTo(() => Role)\n  role!: BelongsTo<Role>;` });
  }
  if (hidden.length) userMembers.push(hideColumns(hidden));
  patchModel(projectRoot, files("User"), { core, imports, members: userMembers });

  if (plan.permissions) {
    patchModel(projectRoot, files("Role"), {
      core: ["BelongsToMany"],
      imports: [`import { Permission } from "./permission.model";`],
      members: [
        {
          has: /\bpermissions\s*[!?]?\s*:/,
          code: `  @BelongsToMany(() => Permission, { table: "role_permissions" })\n  permissions!: BelongsToMany<Permission>;`,
        },
      ],
    });
  }
  if (usesApiKeys(plan)) patchModel(projectRoot, files("ApiKey"), { members: [hideColumns(["key_hash"])] });
}

/** Register the handlers (and controller) in src/app.ts. */
function patchApp(projectRoot: string, plan: AuthPlan) {
  const file = path.join(projectRoot, "src", "app.ts");
  const register: { name: string; from: string; line: string; has: RegExp }[] = [];
  if (plan.strategy) {
    register.push({
      name: "AppAuthentication",
      from: "./auth/authentication",
      line: "app.useAuthentication(AppAuthentication);",
      has: /\.useAuthentication\s*\(/,
    });
  }
  register.push({
    name: "AppAuthorization",
    from: "./auth/authorization",
    line: "app.useAuthorization(AppAuthorization);",
    has: /\.useAuthorization\s*\(/,
  });
  const manual = () => {
    const steps = [
      ...register.map((r) => `import { ${r.name} } from "${r.from}";  ${r.line}`),
      ...(plan.strategy ? [`import { AuthController } from "./controllers/auth.controller";  app.useControllers([..., AuthController])`] : []),
    ];
    log.info(`  Register them in your app:\n${steps.map((s) => `    ${s}`).join("\n")}`);
  };
  if (!fs.existsSync(file)) return manual();

  let source = fs.readFileSync(file, "utf8");
  const quote = /from\s+'/.test(source) ? "'" : '"';
  const add = register.filter((r) => !r.has.test(source));
  for (const r of register) {
    if (r.has.test(source) && !source.includes(r.name)) {
      log.warn(`src/app.ts already calls ${r.line.split("(")[0]}(...): check that it uses ${r.name}.`);
    }
  }
  const imports = add.map((r) => `import { ${r.name} } from ${quote}${r.from}${quote};`);
  const controllers = /\.useControllers\s*\(\s*\[([^\]]*)\]/;
  const addController = !!plan.strategy && !/\bAuthController\b/.test(source);
  if (addController) imports.push(`import { AuthController } from ${quote}./controllers/auth.controller${quote};`);
  if (!imports.length) return;

  const last = [...source.matchAll(/^import .*;[ \t]*$/gm)].pop();
  if (last) {
    const end = last.index! + last[0].length;
    source = `${source.slice(0, end)}\n${imports.join("\n")}${source.slice(end)}`;
  } else {
    source = `${imports.join("\n")}\n${source}`;
  }

  if (add.length) {
    const lines = add.map((r) => r.line).join("\n");
    const at = source.search(/^.*\.useControllers\s*\(/m);
    const exportAt = source.search(/^export default/m);
    const index = at !== -1 ? at : exportAt !== -1 ? exportAt : source.length;
    source = `${source.slice(0, index)}${lines}\n\n${source.slice(index)}`;
  }
  let registered = !addController;
  if (addController) {
    const m = source.match(controllers);
    if (m) {
      const list = m[1].trim();
      source = source.replace(controllers, (whole) => whole.replace(`[${m[1]}]`, `[${list ? `${list.replace(/,\s*$/, "")}, ` : ""}AuthController]`));
      registered = true;
    }
  }
  fs.writeFileSync(file, source, "utf8");
  log.success("Updated: src/app.ts");
  if (!registered) log.info("  Add AuthController to your app's controllers: app.useControllers([..., AuthController])");
}

/** JWT_SECRET and JWT_EXPIRES_IN in .env (and .env.example, without the secret). */
function patchEnv(projectRoot: string) {
  const append = (name: string, values: Record<string, string>, create: boolean) => {
    const file = path.join(projectRoot, name);
    if (!fs.existsSync(file) && !create) return;
    const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const missing = Object.entries(values).filter(([k]) => !new RegExp(`^\\s*${k}\\s*=`, "m").test(source));
    if (!missing.length) return;
    const block = [
      "# Auth (megh scaffold:auth): signing key for access tokens and their lifetime.",
      ...missing.map(([k, v]) => `${k}=${v}`),
    ].join("\n");
    const head = source.trimEnd();
    fs.writeFileSync(file, `${head ? `${head}\n\n` : ""}${block}\n`, "utf8");
    log.success(`Updated: ${name} (${missing.map(([k]) => k).join(", ")})`);
  };
  append(".env", { JWT_SECRET: crypto.randomBytes(48).toString("hex"), JWT_EXPIRES_IN: "1d" }, true);
  append(".env.example", { JWT_SECRET: "", JWT_EXPIRES_IN: "1d" }, false);
}

/**
 * Make `db:seed` run the roles seeder: when the entry seeder
 * (database.seeder.ts) exists, it runs instead of every seeder, so "roles"
 * is added to its calls.
 */
function patchEntrySeeder(projectRoot: string, seedersDir: string) {
  const file = path.join(seedersDir, "database.seeder.ts");
  const rel = relPath(projectRoot, file);
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  // Code lines only: the stub's comment shows `await call("roles", "users")`.
  const lines = source.split("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line);
  if (lines.some((l) => isCode(l) && /call\([^)]*["']roles["']/.test(l))) return;
  // An empty run() (comments only), as make:seeder database writes it.
  const empty = /async\s+run\s*\(\s*\)\s*\{(?:\s*\/\/[^\n]*)*\s*\}/;
  const callLine = lines.findIndex((l) => isCode(l) && /await\s+call\(/.test(l));
  let next: string | undefined;
  if (empty.test(source)) next = source.replace(empty, `async run({ call }) {\n    await call("roles");\n  }`);
  else if (callLine !== -1) {
    lines[callLine] = lines[callLine].replace(/await\s+call\(/, `await call("roles", `);
    next = lines.join("\n");
  }
  if (!next) {
    log.info(`  Run the roles seeder from ${rel}: await call("roles");`);
    return;
  }
  fs.writeFileSync(file, next, "utf8");
  log.success(`Updated: ${rel} (calls "roles")`);
}

/** `auth: "bearer"` in src/config/openapi.config.ts, for Swagger UI's Authorize button. */
function patchOpenApi(projectRoot: string, plan: AuthPlan) {
  const file = path.join(projectRoot, "src", "config", "openapi.config.ts");
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  if (/\bauth\s*:/.test(source)) return;
  const scheme = usesJwt(plan) ? "bearer" : "apiKey";
  const quote = /'/.test(source) ? "'" : '"';
  const next = source.replace(/^(\s*)routePrefix\s*:.*$/m, (line, indent: string) => `${line}\n${indent}auth: ${quote}${scheme}${quote},`);
  if (next === source) return;
  fs.writeFileSync(file, next, "utf8");
  log.success(`Updated: src/config/openapi.config.ts (auth: "${scheme}")`);
}

async function generate(projectRoot: string, choice: AuthChoice, opts: AuthOptions) {
  const { migrations: migrationsDir, seeders } = databasePaths(projectRoot);
  const at = (rel: string) => path.join(projectRoot, ...rel.split("/"));
  const seederRel = relPath(projectRoot, path.join(seeders, "roles.seeder.ts"));

  const files: Record<string, (plan: AuthPlan) => string> = {};
  if (choice.strategy) {
    files["src/auth/password.ts"] = renderPassword;
    if (usesJwt(choice)) files["src/auth/jwt.ts"] = renderJwt;
    if (usesApiKeys(choice)) files["src/auth/api-keys.ts"] = renderApiKeys;
    files["src/auth/authentication.ts"] = (p) => renderAuthentication(p, paths);
    files["src/dtos/auth.dto.ts"] = renderAuthDto;
    files["src/services/auth.service.ts"] = (p) => renderAuthService(p, paths);
    files["src/controllers/auth.controller.ts"] = (p) => renderAuthController(p, paths);
  }
  files["src/auth/authorization.ts"] = (p) => renderAuthorization(p, paths);
  if (usesRoles(choice)) {
    files["src/auth/rbac.ts"] = (p) => renderRbac(p, paths);
    files[seederRel] = (p) => renderRolesSeeder(p, paths, seederRel);
  }

  // Tables: create the missing ones, add missing columns to an existing users table.
  const { users, others } = tableTemplates(projectRoot, choice);
  const before = readMigrationSchema(migrationsDir);
  const existingUsers = before.get("users");
  const addColumns = existingUsers
    ? requiredUserColumns(choice, users).filter((f) => !existingUsers.columns.some((c) => c.name === f.name))
    : [];

  // Check before writing anything. A file that already has exactly the
  // content it would get (e.g. rbac.ts from an earlier scaffold:rbac) is kept.
  const expectedColumns = new Set([
    ...(existingUsers ? existingUsers.columns.map((c) => c.name) : ["id", ...users.fields.map((f) => f.name)]),
    ...addColumns.map((f) => f.name),
  ]);
  const expected: AuthPlan = { ...choice, userColumns: expectedColumns };
  const same = (rel: string) => fs.existsSync(at(rel)) && fs.readFileSync(at(rel), "utf8") === files[rel](expected);
  if (!opts.force) {
    const taken = Object.keys(files).filter((f) => fs.existsSync(at(f)) && !same(f));
    if (taken.length) {
      throw new CliError(
        `Already exists: ${taken.join(", ")}. Use -f or --force to overwrite ` +
          "(e.g. to switch between single and multiple roles).",
      );
    }
  }
  const targets: Target[] = [
    ...(existingUsers ? [] : [{ template: users, model: "User", table: "users", requested: true }]),
    ...others.map((t) => ({ template: t, model: modelName(t.name), table: t.table, requested: true })),
  ];
  await scaffold(projectRoot, targets, { cwd: projectRoot, mode: "model", reuseExisting: true, now: opts.now });

  if (addColumns.length) {
    const stamp = migrationTimestamp(firstFreeTimestamp(migrationsDir, opts.now ?? new Date()));
    const file = path.join(migrationsDir, `${stamp}_add_auth_columns_to_users_table.ts`);
    writeFileSafe(file, renderAlterMigration("users", addColumns));
    log.success(`Migration created: ${relPath(projectRoot, file)} (${addColumns.map((f) => f.name).join(", ")})`);
    if (fs.existsSync(generatedFiles(projectRoot, "User").model)) updateModel("User", { cwd: projectRoot });
    else makeModel("User", { cwd: projectRoot });
  } else if (existingUsers && !fs.existsSync(generatedFiles(projectRoot, "User").model)) {
    makeModel("User", { cwd: projectRoot });
  }

  const usersTable = readMigrationSchema(migrationsDir).get("users");
  const plan: AuthPlan = { ...choice, userColumns: new Set(usersTable?.columns.map((c) => c.name) ?? []) };
  patchModels(projectRoot, plan);

  for (const [rel, render] of Object.entries(files)) {
    const content = render(plan);
    if (fs.existsSync(at(rel)) && fs.readFileSync(at(rel), "utf8") === content) {
      log.info(`  Up to date: ${rel}`);
      continue;
    }
    writeFileSafe(at(rel), content, opts.force);
    log.success(`Created: ${rel}`);
  }

  patchApp(projectRoot, plan);
  if (usesRoles(plan)) patchEntrySeeder(projectRoot, seeders);
  if (usesJwt(plan)) patchEnv(projectRoot);
  if (plan.strategy) patchOpenApi(projectRoot, plan);
  return plan;
}

const modelName = (snake: string) => snake.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase());

function warnPackages(projectRoot: string, plan: AuthPlan) {
  const missing: string[] = [];
  const missingDev: string[] = [];
  if (usesJwt(plan) && !installedVersion("jsonwebtoken", projectRoot)) missing.push("jsonwebtoken");
  if (usesJwt(plan) && !installedVersion("@types/jsonwebtoken", projectRoot)) missingDev.push("@types/jsonwebtoken");
  if (plan.strategy) {
    for (const pkg of ["class-validator", "class-transformer"]) if (!installedVersion(pkg, projectRoot)) missing.push(pkg);
  }
  if (missing.length) log.warn(`Install: npm install ${missing.join(" ")}`);
  if (missingDev.length) log.warn(`Install: npm install -D ${missingDev.join(" ")}`);
}

/**
 * `scaffold:auth`: sign-up and sign-in with JWTs, API keys or both, and
 * optionally roles (one or many per user) with permissions.
 */
export async function scaffoldAuth(opts: AuthOptions = {}): Promise<AuthPlan> {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const choice = await ask(opts, true, "none");
  const plan = await generate(projectRoot, choice, opts);
  warnPackages(projectRoot, plan);

  log.info(
    [
      "",
      "  Routes:",
      "    POST /auth/register   { name, email, password }",
      `    POST /auth/login      { email, password } → ${usesJwt(plan) ? "{ access_token, ... }" : "{ api_key, ... }"}`,
      "    GET  /auth/me",
      ...(usesApiKeys(plan) ? ["    GET|POST /auth/api-keys, DELETE /auth/api-keys/:id"] : []),
      `  Protect a route with @Authorized()${usesRoles(plan) ? ', or @Authorized({ roles: ["admin"] })' : ""}${plan.permissions ? ' / { permissions: ["users.manage"] }' : ""}.`,
      `  Next: megh migrate${usesRoles(plan) ? " --seed (creates the admin and user roles)" : ""}`,
    ].join("\n"),
  );
  return plan;
}

/** `scaffold:rbac`: roles (and permissions) for an app's users, without sign-in. */
export async function scaffoldRbac(opts: AuthOptions = {}): Promise<AuthPlan> {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const choice = await ask(opts, false, "multiple");
  if (choice.roles === "none") throw new CliError('scaffold:rbac needs --roles single or multiple.');
  const plan = await generate(projectRoot, choice, opts);
  log.info(
    [
      "",
      '  Check roles with @Authorized({ roles: ["admin"] })' + (plan.permissions ? ' or { permissions: ["users.manage"] }' : "") + ",",
      "  or in code: hasRole(user, [\"admin\"]) from src/auth/rbac.ts. AppAuthorization reads request.user,",
      "  so register an authentication handler that sets it (megh scaffold:auth generates one).",
      "  Next: megh migrate --seed (creates the admin and user roles)",
    ].join("\n"),
  );
  return plan;
}
