import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { faker as defaultFaker, fakerDE } from "@faker-js/faker";
import {
  AutoIncrement,
  BelongsTo,
  Column,
  Model,
  PrimaryKey,
  Seeders,
  Table,
  defineFactory,
  defineSeeder,
  getFaker,
  useFaker,
} from "./index";

@Table("fac_roles")
class Role extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
}

@Table("fac_users")
class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
  @Column() email!: string;
  @Column({ type: "boolean" }) is_active?: boolean;
  @Column({ nullable: true }) role_id!: number | null;

  @BelongsTo(() => Role, { foreignKey: "role_id" }) role?: Role | null;
}

const RoleFactory = defineFactory(Role, ({ faker, sequence }) => ({
  name: `${faker.word.noun()}-${sequence}`,
}));

const UserFactory = defineFactory(User, ({ faker, sequence }) => ({
  name: faker.person.fullName(),
  email: `user${sequence}@${faker.internet.domainName()}`,
  is_active: true,
  role_id: null,
}));

let db: Kysely<any>;

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  Model.useConnection(db);
  await sql`create table fac_roles (id integer primary key autoincrement, name text not null)`.execute(
    db,
  );
  await sql`create table fac_users (id integer primary key autoincrement, name text not null, email text not null, is_active integer not null default 1, role_id integer)`.execute(
    db,
  );
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  useFaker(defaultFaker);
  await sql`delete from fac_users`.execute(db);
  await sql`delete from fac_roles`.execute(db);
  UserFactory.resetSequence();
  RoleFactory.resetSequence();
});

describe("factories", () => {
  it("create() saves a row with fake values", async () => {
    const user = await UserFactory.create();
    expect(user).toBeInstanceOf(User);
    expect(user.id).toBeGreaterThan(0);
    expect(user.name).toMatch(/\S+ \S+/);
    expect(user.email).toMatch(/^user1@/);
    expect(user.is_active).toBe(true);
    expect(await User.count()).toBe(1);
  });

  it("createMany() gives each row its own values and sequence", async () => {
    const users = await UserFactory.createMany(5);
    expect(users.map((u) => u.email.split("@")[0])).toEqual([
      "user1",
      "user2",
      "user3",
      "user4",
      "user5",
    ]);
    expect(new Set(users.map((u) => u.name)).size).toBeGreaterThan(1);
    expect(await User.count()).toBe(5);
  });

  it("overrides and states replace the definition's values", async () => {
    const inactive = UserFactory.state({ is_active: false });
    const ann = await inactive.create({ name: "Ann" });
    expect(ann).toMatchObject({ name: "Ann", is_active: false });
    // A state function gets the context too.
    const tagged = await UserFactory.state(({ sequence }) => ({
      name: `Tagged ${sequence}`,
    })).create();
    expect(tagged.name).toBe("Tagged 2"); // the sequence is shared with derived factories
    // The original factory is unchanged.
    expect((await UserFactory.create()).is_active).toBe(true);
  });

  it("a factory as a value creates the related row and uses its key", async () => {
    const user = await UserFactory.create({ role_id: RoleFactory });
    expect(await Role.count()).toBe(1);
    const loaded = await User.with("role").where("id", user.id!).firstOrFail();
    expect(loaded.role?.id).toBe(user.role_id);
    // Each built row gets its own related row.
    await UserFactory.state({ role_id: RoleFactory }).createMany(2);
    expect(await Role.count()).toBe(3);
  });

  it("make() builds unsaved instances; raw() gives just the values", async () => {
    const user = await UserFactory.make({ name: "Bo" });
    expect(user).toBeInstanceOf(User);
    expect(user.isPersisted()).toBe(false);
    expect(user.name).toBe("Bo");
    expect(await User.count()).toBe(0);
    await user.save();
    expect(await User.count()).toBe(1);

    expect(await UserFactory.makeMany(3)).toHaveLength(3);
    const values = await UserFactory.raw();
    expect(Object.keys(values).sort()).toEqual([
      "email",
      "is_active",
      "name",
      "role_id",
    ]);
    expect(await User.count()).toBe(1);
  });

  it("useFaker() switches the Faker instance, e.g. a locale or a fixed seed", async () => {
    useFaker(fakerDE);
    expect(await getFaker()).toBe(fakerDE);
    fakerDE.seed(42);
    const first = (await UserFactory.raw()).name;
    fakerDE.seed(42);
    expect((await UserFactory.raw()).name).toBe(first);
  });

  it("work inside a seeder, in its transaction", async () => {
    const users = defineSeeder({
      async run() {
        await UserFactory.state({ role_id: RoleFactory }).createMany(3);
        throw new Error("undo");
      },
    });
    await expect(new Seeders(db, { seeders: { users } }).run()).rejects.toThrow(
      "undo",
    );
    expect(await User.count()).toBe(0);
    expect(await Role.count()).toBe(0);
  });
});

// ─── Compile-time checks (checked by `tsc -p tsconfig.test.json`) ───────────

export async function typeChecks() {
  await UserFactory.create({ name: "x", role_id: RoleFactory });
  // @ts-expect-error not a column
  await UserFactory.create({ nope: 1 });
  // @ts-expect-error wrong type
  await UserFactory.create({ name: 1 });
  // @ts-expect-error relations are not columns
  UserFactory.state({ role: null });
  const user = await UserFactory.create();
  const email: string = user.email;
  const made = await UserFactory.make();
  const persisted: boolean = made.isPersisted();
  return [email, persisted];
}
