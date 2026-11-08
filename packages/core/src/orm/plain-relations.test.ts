import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import {
  AutoIncrement,
  BelongsTo,
  BelongsToMany,
  Column,
  HasMany,
  HasOne,
  Model,
  PrimaryKey,
  Table,
} from "./index";

// Relation fields typed with the related model itself, instead of the
// HasMany<…> / BelongsTo<…> markers. Many-to-many keeps its marker for the
// pivot type and attach/detach.

@Table("pr_roles")
class Role extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;

  @HasMany(() => User, { foreignKey: "role_id" }) users?: User[];
}

@Table("pr_users")
class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
  @Column({ nullable: true }) role_id!: number | null;
  @Column({ type: "json", nullable: true }) settings!: any;

  @BelongsTo(() => Role, { foreignKey: "role_id" }) role?: Role | null;
  @HasOne(() => Profile, { foreignKey: "user_id" }) profile?: Profile | null;
  @BelongsToMany(() => Tag, {
    table: "pr_user_tag",
    foreignPivotKey: "user_id",
    relatedPivotKey: "tag_id",
    pivotColumns: ["level"],
  })
  tags?: BelongsToMany<Tag, { level: number }>;

  get label(): string {
    return `${this.name}${this.role ? ` (${this.role.name})` : ""}`;
  }
}

@Table("pr_profiles")
class Profile extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() user_id!: number;
  @Column() bio!: string;
}

@Table("pr_tags")
class Tag extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
}

let db: Kysely<any>;

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  Model.useConnection(db);
  await sql`create table pr_roles (id integer primary key autoincrement, name text not null)`.execute(
    db,
  );
  await sql`create table pr_users (id integer primary key autoincrement, name text not null, role_id integer, settings text)`.execute(
    db,
  );
  await sql`create table pr_profiles (id integer primary key autoincrement, user_id integer not null, bio text not null)`.execute(
    db,
  );
  await sql`create table pr_tags (id integer primary key autoincrement, name text not null)`.execute(
    db,
  );
  await sql`create table pr_user_tag (user_id integer not null, tag_id integer not null, level integer not null)`.execute(
    db,
  );
});

afterAll(async () => {
  await db.destroy();
});

describe("relations typed as models", () => {
  it("loads belongsTo, hasOne, hasMany and belongsToMany", async () => {
    const admin = await Role.create({ name: "Admin" });
    const ann = await User.create({
      name: "Ann",
      role_id: admin.id!,
      settings: null,
    });
    await User.create({ name: "Bob", role_id: null, settings: null });
    await ann.related("profile").create({ bio: "Hi" });
    const tag = await Tag.create({ name: "ops" });
    await ann.related("tags").attach(tag.id!, { level: 2 });

    const users = await User.with("role", "profile", "tags")
      .orderBy("id")
      .get();
    expect(users[0].role?.name).toBe("Admin");
    expect(users[0].profile?.bio).toBe("Hi");
    expect(users[0].tags[0].pivot.level).toBe(2);
    expect(users[0].label).toBe("Ann (Admin)");
    expect(users[1].role).toBeNull();
    expect(users[1].profile).toBeNull();

    const role = await Role.with("users.profile")
      .where("id", admin.id!)
      .firstOrFail();
    expect(role.users.map((u) => u.name)).toEqual(["Ann"]);
    expect(role.users[0].profile?.bio).toBe("Hi");

    await admin.related("users").create({ name: "Cy", settings: null });
    expect(
      await Role.withCount("users").where("id", admin.id!).firstOrFail(),
    ).toMatchObject({ users_count: 2 });
  });

  it("keeps relations out of create() and the JSON output until loaded", async () => {
    const user = await User.create({
      name: "Dee",
      role_id: null,
      settings: { theme: "dark" },
    });
    expect(user.toJSON()).not.toHaveProperty("role");
    expect(user.settings).toEqual({ theme: "dark" });
  });
});

// ─── Compile-time checks (checked by `tsc -p tsconfig.test.json`) ───────────

export async function typeChecks() {
  // Relation fields are not columns: create() neither needs nor takes them.
  await User.create({ name: "x", role_id: null, settings: null });
  // @ts-expect-error relations are not columns
  await User.create({ name: "x", role_id: null, settings: null, role: null });
  // @ts-expect-error relations are not columns
  User.where("role", 1);
  // An `any` column stays a column.
  User.where("settings", "{}");

  const user = await User.with("role", "profile").firstOrFail();
  const roleName: string | undefined = user.role?.name;
  const role: { name: string } | null = user.role;
  const bio: string | undefined = user.profile?.bio;
  // @ts-expect-error a loaded belongsTo may be null
  const notNull: { name: string } = user.role;

  const withUsers = await Role.with("users.profile").firstOrFail();
  const firstUser: string = withUsers.users[0].name;
  const nestedBio: string | undefined = withUsers.users[0].profile?.bio;

  const tagged = await User.with("tags").firstOrFail();
  const level: number = tagged.tags[0].pivot.level;

  // related(): hasMany/hasOne create with the key set; belongsToMany attaches.
  const r = await Role.findOrFail(1);
  await r.related("users").create({ name: "y", settings: null });
  const u = await User.findOrFail(1);
  await u.related("profile").create({ bio: "b" });
  await u.related("tags").attach(1, { level: 1 });

  return [roleName, role, bio, notNull, firstUser, nestedBio, level];
}
