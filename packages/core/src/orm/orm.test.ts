import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { Container } from "../di";
import { NotFoundException } from "../common/exceptions";
import { AvleonApplication } from "../core/application";
import {
  Model,
  ORM_CONNECTION,
  belongsTo,
  hasMany,
  hasOne,
  type DatabaseOf,
} from "./index";

// ─── Models ──────────────────────────────────────────────────────────────────

class User extends Model {
  static readonly table = "users";

  id: number;
  email: string;
  name: string | null;

  posts = hasMany(() => Post);
  profile = hasOne(() => Profile);

  get displayName() {
    return this.name ?? this.email;
  }

  greet() {
    return `Hi ${this.displayName}`;
  }
}

class Profile extends Model {
  static readonly table = "profiles";

  id: number;
  user_id: number;
  bio: string;
}

class Post extends Model {
  static readonly table = "posts";
  static readonly generated = ["id", "published"] as const;

  id: number;
  user_id: number;
  title: string;
  published: number;

  author = belongsTo(() => User, "user_id");
  comments = hasMany(() => Comment);
}

class Comment extends Model {
  static readonly table = "comments";

  id: number;
  post_id: number;
  body: string;

  post = belongsTo(() => Post);
}

// ─── Harness ─────────────────────────────────────────────────────────────────

const queries: string[] = [];
let db: Kysely<any>;

async function reset() {
  for (const table of ["comments", "posts", "profiles", "users"]) {
    await sql`delete from ${sql.table(table)}`.execute(db);
    await sql`delete from sqlite_sequence where name = ${table}`.execute(db);
  }
}

async function seed() {
  const ann = await User.create({ email: "ann@x.io", name: "Ann" });
  const bob = await User.create({ email: "bob@x.io" });
  await Model.db()
    .insertInto("profiles")
    .values({ user_id: ann.id, bio: "Writes" })
    .execute();
  for (const [userId, title] of [
    [ann.id, "A1"],
    [ann.id, "A2"],
    [bob.id, "B1"],
  ] as const) {
    const post = await Post.create({ user_id: userId, title });
    await Model.db()
      .insertInto("comments")
      .values([
        { post_id: post.id, body: `${title}-c1` },
        { post_id: post.id, body: `${title}-c2` },
      ])
      .execute();
  }
  return { ann, bob };
}

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
    log: (e) => {
      // Identifier quotes stripped, so expectations read as plain SQL.
      if (e.level === "query") queries.push(e.query.sql.replace(/"/g, ""));
    },
  });
  await sql`create table users (id integer primary key autoincrement, email text not null, name text)`.execute(
    db,
  );
  await sql`create table profiles (id integer primary key autoincrement, user_id integer not null, bio text not null)`.execute(
    db,
  );
  await sql`create table posts (id integer primary key autoincrement, user_id integer not null, title text not null, published integer not null default 0)`.execute(
    db,
  );
  await sql`create table comments (id integer primary key autoincrement, post_id integer not null, body text not null)`.execute(
    db,
  );
  Model.useConnection(db);
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await reset();
  queries.length = 0;
});

// ─── Runtime ─────────────────────────────────────────────────────────────────

describe("Model", () => {
  it("create() returns a persisted instance with generated columns", async () => {
    const user = await User.create({ email: "a@x.io", name: null });
    expect(user).toBeInstanceOf(User);
    expect(user.id).toBe(1);
    expect(user.isPersisted()).toBe(true);
    expect(user.greet()).toBe("Hi a@x.io");
    const post = await Post.create({ user_id: user.id, title: "t" });
    expect(post.published).toBe(0); // database default
  });

  it("find / findOrFail / all", async () => {
    const { bob } = await seed();
    expect((await User.find(bob.id))?.email).toBe("bob@x.io");
    expect(await User.find(999)).toBeUndefined();
    await expect(User.findOrFail(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await User.all()).map((u) => u.email)).toEqual([
      "ann@x.io",
      "bob@x.io",
    ]);
  });

  it("where / whereIn / whereNull / orderBy / limit / offset / select", async () => {
    await seed();
    expect((await User.where("name", null).get()).map((u) => u.email)).toEqual([
      "bob@x.io",
    ]);
    expect(
      (await User.query().whereNotNull("name").get()).map((u) => u.email),
    ).toEqual(["ann@x.io"]);
    expect(await Post.where("title", "in", ["A1", "B1"]).count()).toBe(2);
    expect(await Post.query().whereIn("title", []).count()).toBe(0);
    expect(
      (
        await Post.query().orderBy("title", "desc").offset(1).limit(1).get()
      ).map((p) => p.title),
    ).toEqual(["A2"]);
    expect(
      await User.where((eb) =>
        eb.or([eb("email", "=", "ann@x.io"), eb("name", "is", null)]),
      ).count(),
    ).toBe(2);

    const [row] = await User.query().select("email").orderBy("id").get();
    expect(row.toJSON()).toEqual({ id: 1, email: "ann@x.io" }); // pk always fetched
  });

  it("eager loads nested relations with one query per level", async () => {
    await seed();
    queries.length = 0;
    const users = await User.with("posts.comments", "profile")
      .orderBy("id")
      .get();
    expect(queries).toEqual([
      "select * from users order by id asc",
      "select * from posts where user_id in (?, ?)",
      "select * from comments where post_id in (?, ?, ?)",
      "select * from profiles where user_id in (?, ?)",
    ]);
    expect(
      users.map((u) => [
        u.email,
        u.profile?.bio ?? null,
        u.posts.map((p) => [p.title, p.comments.length]),
      ]),
    ).toEqual([
      [
        "ann@x.io",
        "Writes",
        [
          ["A1", 2],
          ["A2", 2],
        ],
      ],
      ["bob@x.io", null, [["B1", 2]]],
    ]);
  });

  it("belongsTo, default foreign keys, and select() keeps the keys eager loading needs", async () => {
    await seed();
    const post = await Post.query()
      .select("title")
      .with("author", "comments")
      .where("title", "B1")
      .firstOrFail();
    expect(post.author?.email).toBe("bob@x.io");
    expect(post.comments).toHaveLength(2);

    const comment = await Comment.with("post.author").firstOrFail(); // post → post_id
    expect(comment.post?.author?.email).toBe("ann@x.io");
  });

  it("save() inserts new instances and updates only changed columns", async () => {
    const user = new User().fill({ email: "new@x.io", name: "New" });
    await user.save();
    expect(user.id).toBe(1);
    expect(user.isPersisted()).toBe(true);

    queries.length = 0;
    await user.save(); // nothing changed
    expect(queries).toEqual([]);

    user.name = "Renamed";
    await user.save();
    expect(queries).toEqual(["update users set name = ? where id = ?"]);
    expect((await User.findOrFail(1)).name).toBe("Renamed");
  });

  it("delete(), query update() and delete()", async () => {
    const { ann } = await seed();
    expect(await Post.where("user_id", ann.id).update({ published: 1 })).toBe(
      2,
    );
    expect(await Post.where("published", 1).count()).toBe(2);
    expect(await Comment.where("body", "like", "A1-%").delete()).toBe(2);

    const bob = await User.findOrFail(2);
    await bob.delete();
    expect(bob.isPersisted()).toBe(false);
    expect(await User.find(2)).toBeUndefined();
  });

  it("exists() and paginate()", async () => {
    await seed();
    expect(await User.where("email", "ann@x.io").exists()).toBe(true);
    expect(await User.where("email", "nope").exists()).toBe(false);
    const page = await Post.query()
      .orderBy("id")
      .paginate({ page: 2, perPage: 2 });
    expect(page.data.map((p) => p.title)).toEqual(["B1"]);
    expect(page.meta).toMatchObject({
      total: 3,
      page: 2,
      perPage: 2,
      lastPage: 2,
      prev: 1,
      next: null,
    });
  });

  it("toJSON() has columns and loaded relations only", async () => {
    await seed();
    const user = await User.with("profile").orderBy("id").firstOrFail();
    expect(JSON.parse(JSON.stringify(user))).toEqual({
      id: 1,
      email: "ann@x.io",
      name: "Ann",
      profile: { id: 1, user_id: 1, bio: "Writes" },
    });
    expect(JSON.parse(JSON.stringify(new User().fill({ email: "x" })))).toEqual(
      { email: "x" },
    );
  });

  it("transaction() commits, rolls back, and applies to nested calls", async () => {
    await Model.transaction(async () => {
      await User.create({ email: "kept@x.io" });
    });
    expect(await User.query().count()).toBe(1);

    const createTwo = async () => {
      await User.create({ email: "one@x.io" });
      await Model.transaction(async () => {
        await User.create({ email: "two@x.io" }); // joins the outer transaction
      });
      throw new Error("boom");
    };
    await expect(Model.transaction(createTwo)).rejects.toThrow("boom");
    expect(await User.query().count()).toBe(1);
  });

  it("explains a missing table", async () => {
    class NoTable extends Model {
      id: number;
    }
    await expect(NoTable.all()).rejects.toThrow(/NoTable has no table/);
  });
});

describe("app.useDatabase", () => {
  it("registers the connection for DI and destroys it on close", async () => {
    const other = new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(":memory:") }),
    });
    let destroyed = false;
    const destroy = other.destroy.bind(other);
    other.destroy = async () => {
      destroyed = true;
      await destroy();
    };

    const app = AvleonApplication.getInternalApp();
    app.useDatabase(other);
    expect(Container.get(ORM_CONNECTION)).toBe(other);
    await app.close();
    expect(destroyed).toBe(true);

    Model.useConnection(db); // restore for other tests
  });
});

// ─── Compile-time checks (checked by `tsc -p tsconfig.test.json`) ───────────

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;
type Data<T> = {
  [K in keyof T as T[K] extends (...a: any[]) => any ? never : K]: T[K];
};

export async function typeChecks() {
  User.where("email", "a");
  User.where("id", ">", 3);
  User.where("name", null);
  // @ts-expect-error unknown column
  User.where("emial", "a");
  // @ts-expect-error wrong value type
  User.where("email", 5);
  // @ts-expect-error relations are not columns
  User.where("posts", 1);
  // @ts-expect-error getters are not columns
  User.where("displayName", "x");
  // @ts-expect-error methods are not columns
  User.query().orderBy("greet");

  const u = await User.query().firstOrFail();
  type _1 = Expect<
    Equal<
      Data<typeof u>,
      {
        id: number;
        email: string;
        name: string | null;
        readonly displayName: string;
      }
    >
  >;
  u.greet();
  // @ts-expect-error relation not loaded
  void u.posts;

  const s = await User.query().select("id", "email").firstOrFail();
  type _2 = Expect<Equal<keyof Data<typeof s>, "id" | "email" | "displayName">>;
  // @ts-expect-error not selected
  void s.name;

  const w = await User.with("posts.comments", "profile").firstOrFail();
  const body: string = w.posts[0].comments[0].body;
  const bio: string | undefined = w.profile?.bio;
  // @ts-expect-error posts.author was not loaded
  void w.posts[0].author;
  // @ts-expect-error unknown relation
  User.with("postz");
  // @ts-expect-error unknown nested relation
  User.query().with("posts.likes");

  const p = await Post.with("author.posts").firstOrFail();
  const n: number | undefined = p.author?.posts.length;

  await User.create({ email: "x" }); // id generated, name nullable → optional
  await Post.create({ user_id: 1, title: "t" }); // published listed in `generated`
  // @ts-expect-error email is required
  await User.create({ name: "x" });
  // @ts-expect-error wrong type
  await User.create({ email: 1 });
  // @ts-expect-error unknown column
  await User.create({ email: "x", nope: 1 });

  await User.find(1);
  // @ts-expect-error primary key is a number
  await User.find("1");

  new User().fill({ name: "x" });
  // @ts-expect-error unknown column
  new User().fill({ nope: 1 });
  await Post.where("id", 1).update({ title: "x" });
  // @ts-expect-error wrong type
  await Post.where("id", 1).update({ title: 1 });

  type DB = DatabaseOf<typeof User | typeof Post>;
  const raw = await Model.db<DB>()
    .selectFrom("posts")
    .innerJoin("users", "users.id", "posts.user_id")
    .select(["posts.title", "users.email"])
    .execute();
  type _3 = Expect<
    Equal<(typeof raw)[number], { title: string; email: string }>
  >;
  await Model.db<DB>()
    .insertInto("users")
    .values({ email: "x", name: null })
    .execute(); // id optional
  // @ts-expect-error unknown table
  Model.db<DB>().selectFrom("postz");

  return [body, bio, n];
}
