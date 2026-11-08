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
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
  getNamingStrategy,
  setNamingStrategy,
} from "./index";
import { columnName, propertyName } from "./naming";

// ─── Explicit names ──────────────────────────────────────────────────────────

@Table("legacy_customers")
class Customer extends Model {
  @PrimaryKey({ name: "customer_no" }) @AutoIncrement() id?: number;
  @Column({ name: "e_mail" }) email: string;
  @Column({ name: "full_name", nullable: true }) fullName: string | null;
  @CreatedAt({ name: "created_on" }) createdAt?: Date;

  @HasMany(() => Invoice, { foreignKey: "customer_no" })
  invoices: HasMany<Invoice>;
}

@Table("legacy_invoices")
class Invoice extends Model {
  @PrimaryKey({ name: "invoice_no" }) @AutoIncrement() id?: number;
  @Column({ name: "customer_no" }) customerId: number;
  @Column({ name: "amount_cents" }) amountCents: number;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  customer: BelongsTo<Customer>;
}

// ─── snake_case strategy ─────────────────────────────────────────────────────

@Table("authors")
class Author extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() displayName: string;
  @Column({ type: "boolean" }) isActive: boolean;
  @CreatedAt() createdAt?: Date;
  @UpdatedAt() updatedAt?: Date;

  @HasMany(() => Book) books: HasMany<Book>; // books.author_id
  @HasOne(() => Bio) bio: HasOne<Bio>;
  @BelongsToMany(() => Genre, { pivotColumns: ["is_primary"] })
  genres: BelongsToMany<Genre, { is_primary: number }>;
}

@Table("books")
class Book extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() authorId: number;
  @Column() pageCount: number;
  @Column() publishedOn: string;
  @DeletedAt() deletedAt?: Date | null;

  @BelongsTo(() => Author) author: BelongsTo<Author>; // books.author_id
}

@Table("bios")
class Bio extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() authorId: number;
  @Column() bodyText: string;
}

@Table("genres")
class Genre extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() genreName: string;
}

let db: Kysely<any>;
const queries: string[] = [];

beforeAll(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
    log: (e) => {
      if (e.level === "query") queries.push(e.query.sql.replace(/"/g, ""));
    },
  });
  for (const ddl of [
    sql`create table legacy_customers (customer_no integer primary key autoincrement, e_mail text not null, full_name text, created_on text)`,
    sql`create table legacy_invoices (invoice_no integer primary key autoincrement, customer_no integer not null, amount_cents integer not null)`,
    sql`create table authors (id integer primary key autoincrement, display_name text not null, is_active integer not null, created_at text, updated_at text)`,
    sql`create table books (id integer primary key autoincrement, author_id integer not null, page_count integer not null, published_on text not null, deleted_at text)`,
    sql`create table bios (id integer primary key autoincrement, author_id integer not null, body_text text not null)`,
    sql`create table genres (id integer primary key autoincrement, genre_name text not null)`,
    sql`create table author_genre (author_id integer not null, genre_id integer not null, is_primary integer not null default 0)`,
  ]) {
    await ddl.execute(db);
  }
  Model.useConnection(db);
  setNamingStrategy("snake_case");
});

beforeEach(async () => {
  for (const table of [
    "legacy_invoices",
    "legacy_customers",
    "author_genre",
    "genres",
    "bios",
    "books",
    "authors",
  ]) {
    await sql`delete from ${sql.table(table)}`.execute(db);
  }
  queries.length = 0;
});

afterAll(async () => {
  setNamingStrategy("preserve");
  await db.destroy();
});

describe("explicit column names", () => {
  it("map properties to columns both ways", () => {
    expect(columnName(Customer, "email")).toBe("e_mail");
    expect(columnName(Customer, "id")).toBe("customer_no");
    expect(propertyName(Customer, "full_name")).toBe("fullName");
    // Names that aren't mapped pass through, so keys may be given either way.
    expect(columnName(Customer, "customer_no")).toBe("customer_no");
  });

  it("write, read, query and load relations", async () => {
    const ann = await Customer.create({ email: "ann@x.io", fullName: "Ann" });
    expect(ann.id).toBeGreaterThan(0);
    expect(ann.createdAt).toBeInstanceOf(Date);

    const raw = await db
      .selectFrom("legacy_customers")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(raw).toMatchObject({ e_mail: "ann@x.io", full_name: "Ann" });
    expect(typeof raw.created_on).toBe("string");

    await ann.related("invoices").create({ amountCents: 1200 });
    await Invoice.create({ customerId: ann.id, amountCents: 800 });

    const found = await Customer.where("email", "ann@x.io")
      .with("invoices")
      .firstOrFail();
    expect(found.fullName).toBe("Ann");
    expect(
      found.invoices.map((i) => i.amountCents).sort((a, b) => a - b),
    ).toEqual([800, 1200]);

    const invoice = await Invoice.with("customer")
      .orderBy("amountCents", "desc")
      .firstOrFail();
    expect(invoice.customer?.email).toBe("ann@x.io");
    expect(await Invoice.query().sum("amountCents")).toBe(2000);
    expect(
      await Customer.whereHas("invoices", (q) =>
        q.where("amountCents", ">", 1000),
      ).count(),
    ).toBe(1);

    found.fullName = "Ann B";
    await found.save();
    expect((await Customer.findOrFail(ann.id)).fullName).toBe("Ann B");
    await found.delete();
    expect(await Customer.count()).toBe(0);
  });
});

describe("snake_case naming strategy", () => {
  it("is set by setNamingStrategy (and useMeghORM({ naming }))", () => {
    expect(getNamingStrategy()).toBe("snake_case");
    expect(columnName(Book, "pageCount")).toBe("page_count");
    expect(() => setNamingStrategy("kebab" as any)).toThrow(
      /Unknown naming strategy/,
    );
  });

  it("maps camelCase properties to snake_case columns", async () => {
    const author = await Author.create({ displayName: "Ann", isActive: true });
    expect(author).toMatchObject({ displayName: "Ann", isActive: true });
    expect(author.updatedAt).toBeInstanceOf(Date);

    const raw = await db
      .selectFrom("authors")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(raw).toMatchObject({ display_name: "Ann", is_active: 1 });

    const loaded = await Author.where("isActive", true)
      .orderBy("displayName")
      .firstOrFail();
    expect(loaded.displayName).toBe("Ann");
    expect(JSON.parse(JSON.stringify(loaded))).toMatchObject({
      displayName: "Ann",
      isActive: true,
    });
    expect(queries.at(-1)).toContain(
      "where is_active = ? order by display_name asc",
    );

    await Author.where("displayName", "Ann").update({ displayName: "Ann B" });
    expect((await Author.findByOrFail("displayName", "Ann B")).id).toBe(
      author.id,
    );
  });

  it("loads hasMany, hasOne, belongsTo and belongsToMany through mapped keys", async () => {
    const ann = await Author.create({ displayName: "Ann", isActive: true });
    const bob = await Author.create({ displayName: "Bob", isActive: false });
    await ann
      .related("books")
      .create({ pageCount: 100, publishedOn: "2026-01-01" });
    await Book.create({
      authorId: ann.id,
      pageCount: 300,
      publishedOn: "2026-02-01",
    });
    await Book.create({
      authorId: bob.id,
      pageCount: 50,
      publishedOn: "2026-03-01",
    });
    await Bio.create({ authorId: ann.id, bodyText: "Writes" });
    const fantasy = await Genre.create({ genreName: "fantasy" });
    await ann.related("genres").attach(fantasy, { is_primary: 1 });

    const authors = await Author.with("books", "bio", "genres")
      .orderBy("id")
      .get();
    expect(authors[0].books.map((b) => b.pageCount)).toEqual([100, 300]);
    expect(authors[0].bio?.bodyText).toBe("Writes");
    expect(authors[0].genres[0]).toMatchObject({ genreName: "fantasy" });
    expect(authors[0].genres[0].pivot.is_primary).toBe(1);
    expect(authors[1].books).toHaveLength(1);

    const book = await Book.with("author").where("pageCount", 50).firstOrFail();
    expect(book.author?.displayName).toBe("Bob");

    expect(
      await Author.whereHas("books", (q) =>
        q.where("pageCount", ">", 200),
      ).count(),
    ).toBe(1);
    const counted = await Author.withCount("books").orderBy("id").get();
    expect(counted.map((a) => a.books_count)).toEqual([2, 1]);
    expect((await ann.related("genres").get())[0].genreName).toBe("fantasy");
  });

  it("selects, paginates, aggregates and soft-deletes by property", async () => {
    const ann = await Author.create({ displayName: "Ann", isActive: true });
    for (const pages of [10, 20, 30]) {
      await Book.create({
        authorId: ann.id,
        pageCount: pages,
        publishedOn: `2026-01-${pages}`,
      });
    }

    const narrow = await Book.query()
      .select("pageCount")
      .with("author")
      .orderBy("pageCount")
      .get();
    expect(narrow.map((b) => b.pageCount)).toEqual([10, 20, 30]);
    expect(narrow[0].author?.displayName).toBe("Ann");

    const first = await Book.query().cursorPaginate({
      perPage: 2,
      column: "publishedOn",
    });
    const second = await Book.query().cursorPaginate({
      perPage: 2,
      column: "publishedOn",
      cursor: first.meta.nextCursor,
    });
    expect(second.data.map((b) => b.pageCount)).toEqual([30]);

    expect(await Book.max("pageCount")).toBe(30);
    expect(await Book.query().whereIn("pageCount", [10, 30]).count()).toBe(2);

    const thin = await Book.where("pageCount", 10).firstOrFail();
    await thin.delete();
    expect(await Book.count()).toBe(2);
    expect(await Book.onlyTrashed().count()).toBe(1);
    const raw = await db
      .selectFrom("books")
      .select("deleted_at")
      .where("page_count", "=", 10)
      .executeTakeFirstOrThrow();
    expect(raw.deleted_at).not.toBeNull();
    await Book.onlyTrashed().restore();
    expect(await Book.count()).toBe(3);
  });
});
