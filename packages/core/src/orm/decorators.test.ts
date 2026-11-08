import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import {
  AutoIncrement,
  BelongsTo,
  BelongsToMany,
  Column,
  CreatedAt,
  DeletedAt,
  HasMany,
  HasOne,
  Identity,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
  getModelMetadata,
} from "./index";

interface Settings {
  theme: string;
}

@Table()
class Account extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column({ unique: true }) email: string;
  @Column({ nullable: true }) name: string | null;
  @Column() active: boolean;
  @Column({ type: "json", nullable: true }) settings: Settings | null;
  @CreatedAt() created_at?: Date;
  @UpdatedAt() updated_at?: Date;

  @HasMany(() => Article, { foreignKey: "author_id" })
  articles: HasMany<Article>;
  @HasOne(() => Avatar) avatar: HasOne<Avatar>;
  @BelongsToMany(() => Tag, { table: "account_tag", pivotColumns: ["level"] })
  tags: BelongsToMany<Tag, { level: number }>;

  /** Not a column: no decorator, and private so types leave it out too. */
  private scratch = "not saved";
  touch() {
    this.scratch = "changed";
  }

  get label() {
    return this.name ?? this.email;
  }
}

@Table("articles")
class Article extends Model {
  @PrimaryKey() @Identity() article_id?: number;
  @Column() author_id: number;
  @Column("text") title: string;
  @CreatedAt() created_at?: Date;
  @DeletedAt() deleted_at?: Date | null;

  @BelongsTo(() => Account, { foreignKey: "author_id" })
  author: BelongsTo<Account>;
}

@Table()
class Avatar extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() account_id: number;
  @Column() url: string;
}

@Table()
class Tag extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name: string;
}

let db: Kysely<any>;

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  for (const ddl of [
    sql`create table accounts (id integer primary key autoincrement, email text not null unique, name text, active integer not null, settings text, created_at text, updated_at text)`,
    sql`create table articles (article_id integer primary key autoincrement, author_id integer not null, title text not null, created_at text, deleted_at text)`,
    sql`create table avatars (id integer primary key autoincrement, account_id integer not null, url text not null)`,
    sql`create table tags (id integer primary key autoincrement, name text not null)`,
    sql`create table account_tag (account_id integer not null, tag_id integer not null, level integer not null default 1)`,
  ]) {
    await ddl.execute(db);
  }
  Model.useConnection(db);
});

beforeEach(async () => {
  for (const table of [
    "account_tag",
    "tags",
    "avatars",
    "articles",
    "accounts",
  ]) {
    await sql`delete from ${sql.table(table)}`.execute(db);
  }
});

afterAll(async () => {
  await db.destroy();
});

describe("model decorators", () => {
  it("set the table, primary key and generated columns", () => {
    expect(Account.table).toBe("accounts");
    expect(Article.table).toBe("articles");
    expect(Avatar.table).toBe("avatars");
    expect(Article.primaryKey).toBe("article_id");
    expect(Article.generated).toEqual(["article_id"]);
    expect(Account.timestamps).toBe(true);
    expect(Article.updatedAt).toBeNull();
    expect(Article.softDeletes).toBe(true);
  });

  it("pluralize the class name for @Table()", () => {
    @Table()
    class BlogPost extends Model {}
    @Table()
    class Category extends Model {}
    @Table()
    class Person extends Model {}
    @Table()
    class Box extends Model {}
    expect([BlogPost.table, Category.table, Person.table, Box.table]).toEqual([
      "blog_posts",
      "categories",
      "people",
      "boxes",
    ]);
  });

  it("record columns for schemas", () => {
    const meta = getModelMetadata(Account)!;
    expect(meta.columns.get("id")).toMatchObject({
      primary: true,
      generated: "increment",
      type: "integer",
    });
    expect(meta.columns.get("email")).toMatchObject({ unique: true });
    expect(meta.columns.get("active")?.type).toBe("boolean"); // from design:type
    expect(meta.columns.has("scratch")).toBe(false);
    expect([...meta.relations.keys()]).toEqual(["articles", "avatar", "tags"]);
  });

  it("insert only decorated columns and cast values both ways", async () => {
    const account = await Account.create({
      email: "ann@x.io",
      active: true,
      settings: { theme: "dark" },
    });
    expect(account.id).toBeGreaterThan(0);
    expect(account.created_at).toBeInstanceOf(Date);

    const raw = await db
      .selectFrom("accounts")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(raw.active).toBe(1);
    expect(JSON.parse(raw.settings)).toEqual({ theme: "dark" });

    const loaded = await Account.findOrFail(account.id);
    expect(loaded.active).toBe(true);
    expect(loaded.settings).toEqual({ theme: "dark" });
    expect(loaded.label).toBe("ann@x.io");
  });

  it("save() ignores fields that aren't columns", async () => {
    const account = new Account().fill({ email: "bob@x.io", active: false });
    account.touch();
    await account.save();
    account.name = "Bob";
    await account.save();
    expect((await Account.findOrFail(account.id!)).name).toBe("Bob");
  });

  it("load decorated relations", async () => {
    const ann = await Account.create({ email: "ann@x.io", active: true });
    await Article.create({ author_id: ann.id, title: "Hello" });
    await Avatar.create({ account_id: ann.id, url: "a.png" });
    const tag = await Tag.create({ name: "ts" });
    await ann.related("tags").attach(tag, { level: 3 });

    const found = await Account.with("articles", "avatar", "tags")
      .where("id", ann.id)
      .firstOrFail();
    expect(found.articles.map((a) => a.title)).toEqual(["Hello"]);
    expect(found.avatar?.url).toBe("a.png");
    expect(found.tags[0].pivot.level).toBe(3);

    const article = await Article.with("author").firstOrFail();
    expect(article.author?.email).toBe("ann@x.io");
  });

  it("soft delete with @DeletedAt and fill only @CreatedAt", async () => {
    const ann = await Account.create({ email: "ann@x.io", active: true });
    const article = await Article.create({ author_id: ann.id, title: "Bye" });
    expect(article.created_at).toBeInstanceOf(Date);

    await article.delete();
    expect(await Article.count()).toBe(0);
    expect(await Article.withTrashed().count()).toBe(1);
    expect(article.isTrashed()).toBe(true);
  });

  it("inherit columns from a base model", async () => {
    abstract class Base extends Model {
      @PrimaryKey() @AutoIncrement() id?: number;
      @CreatedAt() created_at?: Date;
    }
    @Table("tags")
    class Label extends Base {
      @Column() name: string;
    }
    expect(Label.primaryKey).toBe("id");
    expect([...getModelMetadata(Label)!.columns.keys()]).toEqual([
      "id",
      "created_at",
      "name",
    ]);
    expect(getModelMetadata(Base)?.table).toBeUndefined();
  });
});

// ─── Compile-time checks (checked by `tsc -p tsconfig.test.json`) ───────────

export async function typeChecks() {
  // id and timestamps are declared with `?`, name is nullable: all optional.
  await Account.create({ email: "x", active: true });
  // @ts-expect-error email is required
  await Account.create({ active: true });

  const a = await Account.query().firstOrFail();
  const id: number = a.id; // present on loaded rows
  const created: Date = a.created_at;
  // @ts-expect-error relations are not columns
  Account.where("articles", 1);
  Account.where("active", true);

  const withArticles = await Account.with("articles").firstOrFail();
  const title: string = withArticles.articles[0].title;
  const tags = await Account.with("tags").firstOrFail();
  const level: number = tags.tags[0].pivot.level;

  return [id, created, title, level];
}
