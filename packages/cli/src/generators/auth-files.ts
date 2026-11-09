/**
 * Source of the files `scaffold:auth` and `scaffold:rbac` write. Each renderer
 * gets the plan (strategy, role mode, permissions) and the columns the
 * users table ends up with, so the code only uses columns that exist.
 */

export type AuthStrategy = "jwt" | "api-key" | "both";
export type RoleMode = "none" | "single" | "multiple";

export interface AuthPlan {
  /** Undefined for `scaffold:rbac` (no sign-in endpoints). */
  strategy?: AuthStrategy;
  roles: RoleMode;
  permissions: boolean;
  /** Columns of the users table. */
  userColumns: Set<string>;
}

/** The choices alone, before the users table is known. */
export type AuthChoice = Omit<AuthPlan, "userColumns">;

export const usesJwt = (p: AuthChoice) => p.strategy === "jwt" || p.strategy === "both";
export const usesApiKeys = (p: AuthChoice) => p.strategy === "api-key" || p.strategy === "both";
export const usesRoles = (p: AuthChoice) => p.roles !== "none";

/** Import paths between the generated files, relative to each file. */
export interface Paths {
  /** From `src/auth/` to `src/models/`, etc. */
  rel(from: string, to: string): string;
}

/** The relation path `authenticate` eager loads: `roles.permissions`, `role`, … */
export function rolesRelation(plan: AuthPlan): string | undefined {
  if (!usesRoles(plan)) return undefined;
  const base = plan.roles === "single" ? "role" : "roles";
  return plan.permissions ? `${base}.permissions` : base;
}

const lines = (...parts: (string | false | undefined)[]) => parts.filter((p): p is string => typeof p === "string").join("\n");

export function renderPassword(): string {
  return `import { randomBytes, scrypt, timingSafeEqual } from "crypto";

/**
 * Password hashing with scrypt (built into Node.js). Hashes are stored as
 * \`scrypt$<salt>$<hash>\` in hex.
 */

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, KEY_LENGTH);
  return \`scrypt$\${salt.toString("hex")}$\${hash.toString("hex")}\`;
}

/** Whether \`password\` matches a hash from hashPassword(), in constant time. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, salt, hash] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await derive(password, Buffer.from(salt, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
`;
}

export function renderJwt(): string {
  return `import { sign, verify, type SignOptions } from "jsonwebtoken";

/**
 * HS256 access tokens signed with JWT_SECRET, valid for JWT_EXPIRES_IN
 * (default "1d"). Both are read from .env.
 */

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Set JWT_SECRET in .env to a random string of at least 32 characters.");
  }
  return value;
}

export function tokenLifetime(): string {
  return process.env.JWT_EXPIRES_IN || "1d";
}

export function signToken(userId: number): string {
  return sign({}, secret(), {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: tokenLifetime() as SignOptions["expiresIn"],
  });
}

/** The user id of a valid, unexpired token, or null. */
export function verifyToken(token: string): number | null {
  const key = secret();
  try {
    const payload = verify(token, key, { algorithms: ["HS256"] });
    const id = typeof payload === "object" ? Number(payload.sub) : NaN;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}
`;
}

export function renderApiKeys(): string {
  return `import { createHash, randomBytes } from "crypto";

/**
 * API keys: \`mk_\` and 43 random characters. Only the SHA-256 hash is stored,
 * so a key can be shown once, when it is created.
 */

/** Request header carrying the key (lower-case, as Node reads headers). */
export const API_KEY_HEADER = "x-api-key";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = \`mk_\${randomBytes(32).toString("base64url")}\`;
  return { key, prefix: key.slice(0, 11), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
`;
}

export function renderAuthentication(plan: AuthPlan, p: Paths): string {
  const file = "src/auth/authentication.ts";
  const relation = rolesRelation(plan);
  const query = relation ? `User.with(${JSON.stringify(relation)}).where("id", id).first()` : `User.where("id", id).first()`;
  const active = plan.userColumns.has("is_active");
  const how = [usesJwt(plan) && "an `Authorization: Bearer <token>` header", usesApiKeys(plan) && "an `X-API-Key` header"]
    .filter(Boolean)
    .join(" or ");
  return lines(
    `import { AppService, MeghAuthentication, type IRequest, type Row } from "@meghjs/core";`,
    `import { User } from "${p.rel(file, "src/models/user.model.ts")}";`,
    usesApiKeys(plan) && `import { ApiKey } from "${p.rel(file, "src/models/api-key.model.ts")}";`,
    usesApiKeys(plan) && `import { API_KEY_HEADER, hashApiKey } from "./api-keys";`,
    usesJwt(plan) && `import { verifyToken } from "./jwt";`,
    ``,
    `/**`,
    ` * Who is calling: ${how}. The user it returns becomes \`request.user\``,
    ` * (\`@AuthUser()\` in controllers)${relation ? `, with \`${relation}\` loaded` : ""}. Registered with`,
    ` * app.useAuthentication(AppAuthentication).`,
    ` */`,
    `@AppService`,
    `export class AppAuthentication extends MeghAuthentication<Row<User>> {`,
    `  async authenticate(request: IRequest): Promise<Row<User> | null> {`,
    usesJwt(plan) &&
      lines(
        `    const header = request.headers.authorization;`,
        `    if (typeof header === "string" && header.startsWith("Bearer ")) {`,
        `      const id = verifyToken(header.slice(7).trim());`,
        `      return id === null ? null : this.findUser(id);`,
        `    }`,
      ),
    usesApiKeys(plan) &&
      lines(
        ``,
        `    const key = request.headers[API_KEY_HEADER];`,
        `    if (typeof key === "string" && key !== "") {`,
        `      const record = await ApiKey.findBy("key_hash", hashApiKey(key));`,
        `      if (!record || record.revoked_at || (record.expires_at && record.expires_at <= new Date())) return null;`,
        `      record.last_used_at = new Date();`,
        `      await record.save();`,
        `      return this.findUser(record.user_id);`,
        `    }`,
      ),
    `    return null;`,
    `  }`,
    ``,
    `  private async findUser(id: number): Promise<Row<User> | null> {`,
    `    const user = await ${query};`,
    active ? `    return user && user.is_active !== false ? user : null;` : `    return user ?? null;`,
    `  }`,
    `}`,
    ``,
  );
}

export function renderAuthorization(plan: AuthPlan, p: Paths): string {
  const file = "src/auth/authorization.ts";
  const roles = usesRoles(plan);
  return lines(
    `import { CanAuthorize, UnauthorizedException, type IRequest, type Row } from "@meghjs/core";`,
    `import type { User } from "${p.rel(file, "src/models/user.model.ts")}";`,
    roles && `import { ${plan.permissions ? "hasPermission, hasRole" : "hasRole"} } from "./rbac";`,
    ``,
    `export type AuthorizeOptions = {`,
    roles && `  /** Any of these roles (slug or name). */`,
    roles && `  roles?: string[];`,
    plan.permissions && `  /** Any of these permissions. */`,
    plan.permissions && `  permissions?: string[];`,
    `};`,
    ``,
    `/**`,
    ` * \`@Authorized()\`: the caller must be signed in (401 otherwise).`,
    roles && ` * \`@Authorized({ roles: ["admin"] })\`: and have one of these roles (403 otherwise).`,
    plan.permissions && ` * \`@Authorized({ permissions: ["users.manage"] })\`: and one of these permissions.`,
    ` * Registered with app.useAuthorization(AppAuthorization).`,
    ` */`,
    `@CanAuthorize`,
    `export class AppAuthorization {`,
    `  async authorize(request: IRequest, options: AuthorizeOptions = {}): Promise<boolean> {`,
    `    const user = request.user as Row<User> | undefined;`,
    `    if (!user) throw new UnauthorizedException("Sign in to continue.");`,
    roles && `    if (options.roles?.length && !(await hasRole(user, options.roles))) return false;`,
    plan.permissions &&
      `    if (options.permissions?.length && !(await hasPermission(user, options.permissions))) return false;`,
    roles ? `    return true;` : lines(`    void options;`, `    return true;`),
    `  }`,
    `}`,
    ``,
  );
}

export function renderRbac(plan: AuthPlan, p: Paths): string {
  const file = "src/auth/rbac.ts";
  const single = plan.roles === "single";
  return lines(
    `import type { Row } from "@meghjs/core";`,
    `import { Role } from "${p.rel(file, "src/models/role.model.ts")}";`,
    plan.permissions && `import type { Permission } from "${p.rel(file, "src/models/permission.model.ts")}";`,
    `import type { User } from "${p.rel(file, "src/models/user.model.ts")}";`,
    ``,
    `/**`,
    single
      ? ` * Role checks. Each user has at most one role (users.role_id).`
      : ` * Role checks. A user has any number of roles (the user_roles table).`,
    plan.permissions && ` * Roles grant permissions (the role_permissions table).`,
    ` * Relations loaded by AppAuthentication are used as they are; otherwise they are queried.`,
    ` */`,
    ``,
    `/** The user's roles. */`,
    `export async function rolesOf(user: Row<User>): Promise<Row<Role>[]> {`,
    single
      ? lines(
          `  const loaded: unknown = (user as { role?: unknown }).role;`,
          `  if (loaded && typeof loaded === "object") return [loaded as Row<Role>];`,
          `  if (user.role_id == null) return [];`,
          `  const role = await Role.find(user.role_id);`,
          `  return role ? [role] : [];`,
        )
      : lines(
          `  const loaded: unknown = (user as { roles?: unknown }).roles;`,
          `  if (Array.isArray(loaded)) return loaded as Row<Role>[];`,
          `  return user.related("roles").get();`,
        ),
    `}`,
    ``,
    `/** Whether the user has any of these roles (slug or name). */`,
    `export async function hasRole(user: Row<User>, roles: string[]): Promise<boolean> {`,
    `  return (await rolesOf(user)).some((role) => roles.includes(role.slug) || roles.includes(role.name));`,
    `}`,
    plan.permissions &&
      lines(
        ``,
        `/** Names of the permissions the user's roles grant. */`,
        `export async function permissionsOf(user: Row<User>): Promise<string[]> {`,
        `  const names = new Set<string>();`,
        `  for (const role of await rolesOf(user)) {`,
        `    const loaded: unknown = (role as { permissions?: unknown }).permissions;`,
        `    const permissions = Array.isArray(loaded)`,
        `      ? (loaded as Row<Permission>[])`,
        `      : await role.related("permissions").get();`,
        `    for (const permission of permissions) names.add(permission.name);`,
        `  }`,
        `  return [...names];`,
        `}`,
        ``,
        `/** Whether the user's roles grant any of these permissions. */`,
        `export async function hasPermission(user: Row<User>, permissions: string[]): Promise<boolean> {`,
        `  const granted = await permissionsOf(user);`,
        `  return permissions.some((name) => granted.includes(name));`,
        `}`,
      ),
    ``,
    single
      ? `/** Give the user the role with this slug (replacing its role). False if there is no such role. */`
      : `/** Give the user the role with this slug. False if there is no such role. */`,
    `export async function assignRole(user: Row<User>, slug: string): Promise<boolean> {`,
    `  const role = await Role.findBy("slug", slug);`,
    `  if (!role) return false;`,
    single
      ? lines(`  user.role_id = role.id!;`, `  await user.save();`)
      : lines(
          `  const current = await user.related("roles").get();`,
          `  if (!current.some((r) => r.id === role.id)) await user.related("roles").attach(role);`,
        ),
    `  return true;`,
    `}`,
    ``,
  );
}

export function renderRolesSeeder(plan: AuthPlan, p: Paths, seederFile: string): string {
  return lines(
    `import { defineSeeder } from "@meghjs/core";`,
    plan.permissions && `import { Permission } from "${p.rel(seederFile, "src/models/permission.model.ts")}";`,
    `import { Role } from "${p.rel(seederFile, "src/models/role.model.ts")}";`,
    ``,
    `/** The roles (and permissions) the app starts with. Safe to run again. */`,
    `const ROLES = [`,
    `  { name: "Admin", slug: "admin", description: "Full access" },`,
    `  { name: "User", slug: "user", description: "A signed-up user" },`,
    `];`,
    plan.permissions &&
      lines(
        ``,
        `/** Permissions per role slug. Check them with @Authorized({ permissions: [...] }). */`,
        `const PERMISSIONS: Record<string, string[]> = {`,
        `  admin: ["users.view", "users.manage", "roles.manage"],`,
        `  user: [],`,
        `};`,
      ),
    ``,
    `export default defineSeeder({`,
    `  async run() {`,
    `    for (const data of ROLES) {`,
    plan.permissions
      ? `      const role = (await Role.findBy("slug", data.slug)) ?? (await Role.create(data));`
      : lines(`      if (await Role.findBy("slug", data.slug)) continue;`, `      await Role.create(data);`),
    plan.permissions &&
      lines(
        `      const granted = await role.related("permissions").get();`,
        `      for (const name of PERMISSIONS[data.slug] ?? []) {`,
        `        const permission =`,
        `          (await Permission.findBy("name", name)) ??`,
        `          (await Permission.create({ name, group: name.split(".")[0], description: null }));`,
        `        if (!granted.some((p) => p.id === permission.id)) await role.related("permissions").attach(permission);`,
        `      }`,
      ),
    `    }`,
    `  },`,
    `});`,
    ``,
  );
}

export function renderAuthDto(plan: AuthPlan): string {
  const api = usesApiKeys(plan);
  const name = plan.userColumns.has("name");
  const validators = ["IsEmail", "IsString", "MaxLength", "MinLength", ...(api ? ["IsDate", "IsOptional"] : [])].sort();
  return lines(
    api && `import { Type } from "class-transformer";`,
    `import { ${validators.join(", ")} } from "class-validator";`,
    ``,
    `/** \`POST /auth/register\` */`,
    `export class RegisterDto {`,
    name && lines(`  @IsString()`, `  @MaxLength(255)`, `  name!: string;`, ``),
    `  @IsEmail()`,
    `  @MaxLength(255)`,
    `  email!: string;`,
    ``,
    `  @IsString()`,
    `  @MinLength(8)`,
    `  @MaxLength(128)`,
    `  password!: string;`,
    `}`,
    ``,
    `/** \`POST /auth/login\` */`,
    `export class LoginDto {`,
    `  @IsEmail()`,
    `  email!: string;`,
    ``,
    `  @IsString()`,
    `  password!: string;`,
    `}`,
    api &&
      lines(
        ``,
        `/** \`POST /auth/api-keys\` */`,
        `export class CreateApiKeyDto {`,
        `  @IsString()`,
        `  @MaxLength(100)`,
        `  name!: string;`,
        ``,
        `  @IsOptional()`,
        `  @Type(() => Date)`,
        `  @IsDate()`,
        `  expires_at?: Date;`,
        `}`,
      ),
    ``,
  );
}

export function renderAuthService(plan: AuthPlan, p: Paths): string {
  const file = "src/services/auth.service.ts";
  const jwt = usesJwt(plan);
  const api = usesApiKeys(plan);
  const cols = plan.userColumns;
  const coreImports = ["AppService", "BadRequestException", "UnauthorizedException", ...(api ? ["NotFoundException"] : [])].sort();
  const dtos = ["LoginDto", "RegisterDto", ...(api ? ["CreateApiKeyDto"] : [])].sort();
  const createFields = [cols.has("name") && "name: input.name", "email: input.email", "password: await hashPassword(input.password)"]
    .filter(Boolean)
    .join(", ");
  return lines(
    `import { ${coreImports.join(", ")}, type Row } from "@meghjs/core";`,
    `import { User } from "${p.rel(file, "src/models/user.model.ts")}";`,
    api && `import { ApiKey } from "${p.rel(file, "src/models/api-key.model.ts")}";`,
    `import { ${dtos.join(", ")} } from "${p.rel(file, "src/dtos/auth.dto.ts")}";`,
    `import { hashPassword, verifyPassword } from "${p.rel(file, "src/auth/password.ts")}";`,
    jwt && `import { signToken, tokenLifetime } from "${p.rel(file, "src/auth/jwt.ts")}";`,
    api && `import { generateApiKey } from "${p.rel(file, "src/auth/api-keys.ts")}";`,
    usesRoles(plan) && `import { assignRole } from "${p.rel(file, "src/auth/rbac.ts")}";`,
    ``,
    usesRoles(plan) && `/** Role given to users who register (created by the roles seeder). */`,
    usesRoles(plan) && `const DEFAULT_ROLE = "user";`,
    usesRoles(plan) && ``,
    `@AppService`,
    `export class AuthService {`,
    `  async register(input: RegisterDto) {`,
    `    if (await User.findBy("email", input.email)) {`,
    `      throw new BadRequestException("That email is already registered.");`,
    `    }`,
    `    const user = await User.create({ ${createFields} });`,
    usesRoles(plan) && `    await assignRole(user, DEFAULT_ROLE);`,
    `    return this.issue(user);`,
    `  }`,
    ``,
    `  async login(input: LoginDto) {`,
    `    const user = await User.findBy("email", input.email);`,
    `    const valid = !!user && (await verifyPassword(input.password, user.password));`,
    cols.has("is_active")
      ? `    if (!user || !valid || user.is_active === false) throw new UnauthorizedException("Invalid email or password.");`
      : `    if (!user || !valid) throw new UnauthorizedException("Invalid email or password.");`,
    cols.has("last_login_at") && lines(`    user.last_login_at = new Date();`, `    await user.save();`),
    `    return this.issue(user);`,
    `  }`,
    ``,
    jwt
      ? lines(
          `  /** A signed-in response: an access token for the Authorization header. */`,
          `  private async issue(user: Row<User>) {`,
          `    return { token_type: "Bearer", access_token: signToken(user.id!), expires_in: tokenLifetime(), user };`,
          `  }`,
        )
      : lines(
          `  /** A signed-in response: a new API key for the X-API-Key header. */`,
          `  private async issue(user: Row<User>) {`,
          `    const { key } = await this.createApiKey(user, { name: "login" });`,
          `    return { api_key: key, user };`,
          `  }`,
        ),
    api &&
      lines(
        ``,
        `  listApiKeys(user: Row<User>) {`,
        `    return ApiKey.where("user_id", user.id!).whereNull("revoked_at").orderBy("id", "desc").get();`,
        `  }`,
        ``,
        `  /** A new key. The key itself is only returned here; the database keeps its hash. */`,
        `  async createApiKey(user: Row<User>, input: CreateApiKeyDto) {`,
        `    const { key, prefix, hash } = generateApiKey();`,
        `    const record = await ApiKey.create({`,
        `      user_id: user.id!,`,
        `      name: input.name,`,
        `      prefix,`,
        `      key_hash: hash,`,
        `      expires_at: input.expires_at ?? null,`,
        `    });`,
        `    return { ...record.toJSON(), key };`,
        `  }`,
        ``,
        `  async revokeApiKey(user: Row<User>, id: number) {`,
        `    const record = await ApiKey.where("user_id", user.id!).where("id", id).first();`,
        `    if (!record || record.revoked_at) throw new NotFoundException("API key not found.");`,
        `    record.revoked_at = new Date();`,
        `    await record.save();`,
        `    return { message: "API key revoked." };`,
        `  }`,
      ),
    `}`,
    ``,
  );
}

export function renderAuthController(plan: AuthPlan, p: Paths): string {
  const file = "src/controllers/auth.controller.ts";
  const api = usesApiKeys(plan);
  const core = ["ApiController", "AuthUser", "Authorized", "Body", "Get", "Post", ...(api ? ["Delete", "Param"] : [])].sort();
  const dtos = ["LoginDto", "RegisterDto", ...(api ? ["CreateApiKeyDto"] : [])].sort();
  return lines(
    `import { ${core.join(", ")}, type Row } from "@meghjs/core";`,
    `import { ${dtos.join(", ")} } from "${p.rel(file, "src/dtos/auth.dto.ts")}";`,
    `import type { User } from "${p.rel(file, "src/models/user.model.ts")}";`,
    `import { AuthService } from "${p.rel(file, "src/services/auth.service.ts")}";`,
    ``,
    `@ApiController("/auth")`,
    `export class AuthController {`,
    `  constructor(private readonly authService: AuthService) {}`,
    ``,
    `  @Post("/register")`,
    `  register(@Body() body: RegisterDto) {`,
    `    return this.authService.register(body);`,
    `  }`,
    ``,
    `  @Post("/login")`,
    `  login(@Body() body: LoginDto) {`,
    `    return this.authService.login(body);`,
    `  }`,
    ``,
    `  @Authorized()`,
    `  @Get("/me")`,
    `  me(@AuthUser() user: Row<User>) {`,
    `    return user;`,
    `  }`,
    api &&
      lines(
        ``,
        `  @Authorized()`,
        `  @Get("/api-keys")`,
        `  apiKeys(@AuthUser() user: Row<User>) {`,
        `    return this.authService.listApiKeys(user);`,
        `  }`,
        ``,
        `  @Authorized()`,
        `  @Post("/api-keys")`,
        `  createApiKey(@AuthUser() user: Row<User>, @Body() body: CreateApiKeyDto) {`,
        `    return this.authService.createApiKey(user, body);`,
        `  }`,
        ``,
        `  @Authorized()`,
        `  @Delete("/api-keys/:id")`,
        `  revokeApiKey(@AuthUser() user: Row<User>, @Param("id") id: number) {`,
        `    return this.authService.revokeApiKey(user, Number(id));`,
        `  }`,
      ),
    `}`,
    ``,
  );
}
