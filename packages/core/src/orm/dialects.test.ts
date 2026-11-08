import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import {
  AutoIncrement,
  Column,
  CreatedAt,
  DB,
  Model,
  PrimaryKey,
  Schema,
  Table,
  UpdatedAt,
  createDatabase,
  resolveDatabaseOptions,
  type CreateInput,
  type UpdateInput,
} from "./index";
import type { PageRequest } from "../collection/pagination";

/**
 * The REST operations `make:resource` generates (list, paginate, show,
 * create, update, delete), run against each database Megh supports, on
 * tables built with the schema builder.
 *
 * SQLite always runs, in memory. The others run when their URL is set,
 * pointing at a database the suite may create and drop tables in:
 *
 *   MEGH_TEST_MSSQL_URL=mssql://sa:secret@localhost:1433/megh_test?trustServerCertificate=true
 *   MEGH_TEST_MYSQL_URL=mysql://root:secret@localhost:3306/megh_test
 *   MEGH_TEST_POSTGRES_URL=postgres://postgres:secret@localhost:5432/megh_test
 */
const DATABASES = [
  { name: "sqlite", options: { dialect: "sqlite", database: ":memory:" } },
  { name: "mssql", url: process.env.MEGH_TEST_MSSQL_URL },
  { name: "mysql", url: process.env.MEGH_TEST_MYSQL_URL },
  { name: "postgres", url: process.env.MEGH_TEST_POSTGRES_URL },
] as const;

const TABLE = "megh_dialect_roles";

// What `make:model` writes for the table below.
@Table(TABLE)
class Role extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
  @Column({ nullable: true }) description!: string | null;
  @Column({ type: "boolean" }) active?: boolean;
  @Column() level?: number;
  @Column({ cast: "number" }) budget?: number;
  @Column({ nullable: true, type: "json" }) settings!: Record<
    string,
    unknown
  > | null;
  @Column({ nullable: true, type: "datetime" }) expires_at!: Date | null;
  @CreatedAt() created_at?: Date;
  @UpdatedAt() updated_at?: Date;
}

// What `make:resource` writes for the model (services/model-service.stub).
class RoleService {
  findAll() {
    return Role.query().orderBy("id").get();
  }
  paginate(request: PageRequest = {}) {
    return Role.query().orderBy("id").paginate(request);
  }
  find(id: number) {
    return Role.find(id);
  }
  findOrFail(id: number) {
    return Role.findOrFail(id);
  }
  create(input: CreateInput<typeof Role>) {
    return Role.create(input);
  }
  async update(id: number, changes: UpdateInput<Role>) {
    const role = await Role.findOrFail(id);
    const sent = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    return role.fill(sent).save();
  }
  async delete(id: number) {
    const role = await Role.findOrFail(id);
    await role.delete();
  }
}

const EXPIRES = new Date("2027-01-02T03:04:05.000Z");

for (const database of DATABASES) {
  const configured = "options" in database || Boolean(database.url);

  describe.skipIf(!configured)(`REST operations on ${database.name}`, () => {
    let db: Kysely<any>;
    let schema: Schema;
    const service = new RoleService();

    beforeAll(async () => {
      db = createDatabase(
        resolveDatabaseOptions(
          "options" in database
            ? (database.options as any)
            : { url: database.url },
          () => undefined,
        ),
      );
      Model.useConnection(db);
      schema = new Schema(db);
      await schema.dropIfExists(TABLE);
      await schema.create(TABLE, (table) => {
        table.id();
        table.string("name", 100).unique();
        table.text("description").nullable();
        table.boolean("active").default(true);
        table.integer("level").default(1);
        table.decimal("budget", 10, 2).default(0);
        table.json("settings").nullable();
        table.datetime("expires_at").nullable();
        table.timestamps();
      });
    });

    afterAll(async () => {
      await schema?.dropIfExists(TABLE);
      await db?.destroy();
    });

    let adminId: number;

    it("create() returns the stored row with its id and defaults", async () => {
      const role = await service.create({
        name: "Admin",
        description: null,
        settings: { scopes: ["*"] },
        expires_at: EXPIRES,
      });
      expect(role).toBeInstanceOf(Role);
      expect(typeof role.id).toBe("number");
      expect(role.id).toBeGreaterThan(0);
      expect(role).toMatchObject({
        name: "Admin",
        description: null,
        active: true,
        level: 1,
        budget: 0,
        settings: { scopes: ["*"] },
      });
      expect(role.expires_at?.getTime()).toBe(EXPIRES.getTime());
      expect(role.created_at).toBeInstanceOf(Date);
      adminId = role.id!;
    });

    it("create() takes values for every column type", async () => {
      const role = await service.create({
        name: "Editor",
        description: "Edits posts",
        active: false,
        level: 3,
        budget: 1234.5,
        settings: null,
        expires_at: null,
      });
      expect(role).toMatchObject({
        name: "Editor",
        description: "Edits posts",
        active: false,
        level: 3,
        budget: 1234.5,
        settings: null,
        expires_at: null,
      });
      await service.create({
        name: "Viewer",
        description: null,
        settings: null,
        expires_at: null,
      });
      await service.create({
        name: "Guest",
        description: null,
        settings: null,
        expires_at: null,
      });
    });

    it("findAll() lists every row in id order", async () => {
      const roles = await service.findAll();
      expect(roles.map((r) => r.name)).toEqual([
        "Admin",
        "Editor",
        "Viewer",
        "Guest",
      ]);
    });

    it("paginate() returns a page and the total", async () => {
      const page = await service.paginate({ page: 2, perPage: 3 });
      expect(page.data.map((r) => r.name)).toEqual(["Guest"]);
      expect(page.meta).toMatchObject({
        total: 4,
        page: 2,
        perPage: 3,
        lastPage: 2,
      });
    });

    it("find() and findOrFail() read one row, cast", async () => {
      const role = await service.find(adminId);
      expect(role).toMatchObject({
        id: adminId,
        name: "Admin",
        active: true,
        settings: { scopes: ["*"] },
      });
      expect(role!.expires_at).toBeInstanceOf(Date);
      expect(await service.find(999_999)).toBeUndefined();
      await expect(service.findOrFail(999_999)).rejects.toThrow();
    });

    it("update() saves only the sent fields", async () => {
      const updated = await service.update(adminId, {
        description: "Everything",
        active: false,
        budget: 99.99,
        settings: { scopes: ["users:*"] },
        name: undefined,
      } as UpdateInput<Role>);
      expect(updated).toMatchObject({
        id: adminId,
        name: "Admin",
        description: "Everything",
        active: false,
      });

      const fresh = await service.findOrFail(adminId);
      expect(fresh).toMatchObject({
        name: "Admin",
        description: "Everything",
        active: false,
        budget: 99.99,
        settings: { scopes: ["users:*"] },
      });
      await expect(service.update(999_999, { name: "x" })).rejects.toThrow();
    });

    it("delete() removes the row", async () => {
      const guest = await Role.findByOrFail("name", "Guest");
      await service.delete(guest.id!);
      expect(await service.find(guest.id!)).toBeUndefined();
      expect(await Role.count()).toBe(3);
      await expect(service.delete(guest.id!)).rejects.toThrow();
    });

    it("DB.table() inserts, updates and deletes", async () => {
      const id = await DB.table(TABLE).insertGetId({ name: "Robot" });
      expect(typeof id).toBe("number");
      expect(await DB.table(TABLE).where("id", id).value("name")).toBe("Robot");
      expect(await DB.table(TABLE).where("id", id).update({ level: 9 })).toBe(
        1,
      );
      expect(await DB.table(TABLE).where("id", id).value("level")).toBe(9);
      expect(await DB.table(TABLE).where("id", id).delete()).toBe(1);
    });

    it("a failed transaction leaves nothing behind", async () => {
      await expect(
        Model.transaction(async () => {
          await service.create({
            name: "Temp",
            description: null,
            settings: null,
            expires_at: null,
          });
          throw new Error("undo");
        }),
      ).rejects.toThrow("undo");
      expect(await Role.findBy("name", "Temp")).toBeUndefined();
    });

    it("schema.table() adds, renames and drops columns", async () => {
      await schema.table(TABLE, (table) => {
        table.string("code", 20).nullable();
        table.renameColumn("description", "summary");
        table.dropColumn("level");
      });
      expect(await schema.hasColumn(TABLE, "code")).toBe(true);
      expect(await schema.hasColumn(TABLE, "summary")).toBe(true);
      expect(await schema.hasColumn(TABLE, "description")).toBe(false);
      expect(await schema.hasColumn(TABLE, "level")).toBe(false);
      const row = await DB.table(TABLE).where("id", adminId).first();
      expect(row).toMatchObject({ summary: "Everything", code: null });
    });
  });
}
