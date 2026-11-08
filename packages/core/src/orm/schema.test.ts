import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  DummyDriver,
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteDialect,
  sql,
} from "kysely";
import { Migrations, defineMigration } from "./migrations";
import { Schema, SchemaError } from "./schema";

// ─── SQLite, run for real ────────────────────────────────────────────────────

let db: Kysely<any>;
let schema: Schema;

beforeEach(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  await sql`pragma foreign_keys = on`.execute(db);
  schema = new Schema(db);
});

afterEach(async () => {
  await db.destroy();
});

const columns = async (table: string) =>
  (await db.introspection.getTables())
    .find((t) => t.name === table)
    ?.columns.map((c) => ({
      name: c.name,
      type: c.dataType,
      nullable: c.isNullable,
      autoIncrement: c.isAutoIncrementing,
      hasDefault: c.hasDefaultValue,
    }));

const indexes = async (table: string) =>
  (
    await sql<{
      name: string;
    }>`select name from sqlite_master where type = 'index' and tbl_name = ${table} and name not like 'sqlite_%' order by name`.execute(
      db,
    )
  ).rows.map((r) => r.name);

describe("Schema on SQLite", () => {
  it("creates a table with every column type", async () => {
    await schema.create("everything", (t) => {
      t.id();
      t.string("name", 100);
      t.text("bio").nullable();
      t.integer("age").default(18);
      t.bigInteger("views").default(0);
      t.float("ratio").nullable();
      t.double("score").nullable();
      t.decimal("price", 10, 2).nullable();
      t.boolean("active").default(true);
      t.date("born_on").nullable();
      t.datetime("seen_at").nullable();
      t.time("opens_at").nullable();
      t.json("settings").nullable();
      t.uuid("token").nullable();
      t.binary("avatar").nullable();
      t.timestamps();
      t.softDeletes();
    });

    const cols = await columns("everything");
    expect(cols?.map((c) => c.name)).toEqual([
      "id",
      "name",
      "bio",
      "age",
      "views",
      "ratio",
      "score",
      "price",
      "active",
      "born_on",
      "seen_at",
      "opens_at",
      "settings",
      "token",
      "avatar",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
    expect(cols?.find((c) => c.name === "id")).toMatchObject({
      autoIncrement: true,
    });
    expect(cols?.find((c) => c.name === "name")).toMatchObject({
      type: "varchar(100)",
      nullable: false,
    });
    expect(cols?.find((c) => c.name === "created_at")?.nullable).toBe(true);

    await db.insertInto("everything").values({ name: "Ann" }).execute();
    const row = await db
      .selectFrom("everything")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ id: 1, age: 18, views: 0, active: 1 });
  });

  it("adds unique columns, indexes and foreign keys", async () => {
    await schema.create("teams", (t) => {
      t.id();
      t.string("name").unique();
    });
    await schema.create("users", (t) => {
      t.id();
      t.string("email").unique();
      t.foreignId("team_id").constrained().cascadeOnDelete();
      t.string("first");
      t.string("last");
      t.index(["last", "first"]);
      t.unique(["team_id", "first"]);
    });

    expect(await indexes("users")).toEqual(["users_last_first_index"]);
    await db.insertInto("teams").values({ name: "core" }).execute();
    await db
      .insertInto("users")
      .values({ email: "a@x.io", team_id: 1, first: "A", last: "Z" })
      .execute();

    await expect(
      db
        .insertInto("users")
        .values({ email: "a@x.io", team_id: 1, first: "B", last: "Z" })
        .execute(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      db
        .insertInto("users")
        .values({ email: "b@x.io", team_id: 9, first: "B", last: "Z" })
        .execute(),
    ).rejects.toThrow(/FOREIGN KEY/);

    await db.deleteFrom("teams").execute();
    expect(await db.selectFrom("users").selectAll().execute()).toEqual([]);
  });

  it("changes a table", async () => {
    await schema.create("teams", (t) => t.id());
    await schema.create("posts", (t) => {
      t.id();
      t.string("title");
      t.string("legacy").nullable();
      t.index("title");
    });

    await schema.table("posts", (t) => {
      t.string("slug").nullable().unique();
      t.foreignId("team_id").nullable().constrained();
      t.renameColumn("title", "headline");
      t.dropColumn("legacy");
      t.dropIndex(["title"]);
    });

    expect((await columns("posts"))?.map((c) => c.name)).toEqual([
      "id",
      "headline",
      "slug",
      "team_id",
    ]);
    expect(await indexes("posts")).toEqual(["posts_slug_unique"]);
    await expect(
      db.insertInto("posts").values({ headline: "x", team_id: 5 }).execute(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("renames, checks and drops tables", async () => {
    await schema.create("drafts", (t) => t.id());
    expect(await schema.hasTable("drafts")).toBe(true);
    expect(await schema.hasColumn("drafts", "id")).toBe(true);
    expect(await schema.hasColumn("drafts", "nope")).toBe(false);

    await schema.rename("drafts", "posts");
    expect(await schema.hasTable("drafts")).toBe(false);
    expect(await schema.hasTable("posts")).toBe(true);

    await schema.drop("posts");
    await schema.dropIfExists("posts");
    expect(await schema.hasTable("posts")).toBe(false);
  });

  it("explains what SQLite can't change", async () => {
    await schema.create("a", (t) => {
      t.id();
      t.integer("b_id");
    });
    await expect(
      schema.table("a", (t) => t.foreign("b_id").references("b.id")),
    ).rejects.toThrow(SchemaError);
    await expect(schema.create("empty", () => {})).rejects.toThrow(
      /needs at least one column/,
    );
  });

  it("runs defineMigration() migrations, up and down", async () => {
    const migrations = new Migrations(db, {
      migrations: {
        "1_create_users": defineMigration({
          async up(schema) {
            await schema.create("users", (t) => {
              t.id();
              t.string("email").unique();
            });
          },
          async down(schema) {
            await schema.drop("users");
          },
        }),
        // A migration written against Kysely still runs alongside.
        "2_add_name": {
          async up(kdb) {
            await kdb.schema
              .alterTable("users")
              .addColumn("name", "text")
              .execute();
          },
          async down(kdb) {
            await kdb.schema.alterTable("users").dropColumn("name").execute();
          },
        },
      },
    });

    expect(await migrations.latest()).toEqual(["1_create_users", "2_add_name"]);
    expect(await schema.hasColumn("users", "name")).toBe(true);
    expect(await migrations.reset()).toEqual(["2_add_name", "1_create_users"]);
    expect(await schema.hasTable("users")).toBe(false);
  });
});

// ─── Generated SQL on the other databases ────────────────────────────────────

function compiling(dialect: "postgres" | "mysql" | "mssql") {
  const parts = {
    postgres: [PostgresAdapter, PostgresQueryCompiler, PostgresIntrospector],
    mysql: [MysqlAdapter, MysqlQueryCompiler, MysqlIntrospector],
    mssql: [MssqlAdapter, MssqlQueryCompiler, MssqlIntrospector],
  } as const;
  const [Adapter, Compiler, Introspector] = parts[dialect];
  const statements: string[] = [];
  const fake = new Kysely<any>({
    dialect: {
      createAdapter: () => new Adapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (k) => new Introspector(k),
      createQueryCompiler: () => new Compiler(),
    },
    log: (event) => {
      // Identifier quotes stripped, so expectations read as plain SQL.
      if (event.level === "query")
        statements.push(event.query.sql.replace(/"/g, ""));
    },
  });
  return { schema: new Schema(fake), statements };
}

const createUsers = (s: Schema) =>
  s.create("users", (t) => {
    t.id();
    t.string("email").unique();
    t.boolean("active").default(true);
    t.json("settings").nullable();
    t.foreignId("team_id").constrained().nullOnDelete();
    t.timestamps();
  });

describe("Schema SQL", () => {
  it("PostgreSQL", async () => {
    const { schema, statements } = compiling("postgres");
    await createUsers(schema);
    await schema.table("users", (t) => {
      t.renameColumn("email", "mail");
      t.dropForeign(["team_id"]);
    });
    await schema.rename("users", "members");
    expect(statements).toEqual([
      "create table users (id integer generated by default as identity primary key, email varchar(255) not null unique, active boolean default true not null, settings jsonb, team_id integer, created_at timestamptz, updated_at timestamptz, constraint users_team_id_foreign foreign key (team_id) references teams (id) on delete set null)",
      "alter table users rename column email to mail",
      "alter table users drop constraint users_team_id_foreign",
      "alter table users rename to members",
    ]);
  });

  it("MySQL", async () => {
    const { schema, statements } = compiling("mysql");
    await createUsers(schema);
    await schema.table("users", (t) => {
      t.foreignId("owner_id").constrained("users");
      t.dropIndex("users_email_unique");
      t.dropForeign(["team_id"]);
    });
    expect(statements).toEqual([
      "create table `users` (`id` int primary key auto_increment, `email` varchar(255) not null unique, `active` boolean default true not null, `settings` json, `team_id` int, `created_at` datetime, `updated_at` datetime, constraint `users_team_id_foreign` foreign key (`team_id`) references `teams` (`id`) on delete set null)",
      "alter table `users` add column `owner_id` int not null",
      "alter table `users` add constraint `users_owner_id_foreign` foreign key (`owner_id`) references `users` (`id`)",
      "drop index `users_email_unique` on `users`",
      "alter table `users` drop foreign key `users_team_id_foreign`",
    ]);
  });

  it("SQL Server", async () => {
    const { schema, statements } = compiling("mssql");
    await createUsers(schema);
    await schema.table("users", (t) => t.renameColumn("email", "mail"));
    await schema.rename("users", "members");
    expect(statements).toEqual([
      "create table users (id int identity primary key, email nvarchar(255) not null unique, active bit default 1 not null, settings nvarchar(max), team_id int, created_at datetimeoffset, updated_at datetimeoffset, constraint users_team_id_foreign foreign key (team_id) references teams (id) on delete set null)",
      "exec sp_rename 'users.email', 'mail', 'COLUMN'",
      "exec sp_rename 'users', 'members'",
    ]);
  });
});
