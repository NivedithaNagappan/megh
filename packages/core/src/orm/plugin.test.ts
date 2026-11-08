import "reflect-metadata";
import { afterEach, describe, expect, it } from "vitest";
import { MeghApplication } from "../core/application";
import { AppConfig, MeghConfig } from "../config/config";
import { definePlugin } from "../plugins/plugin";
import { Container } from "../di";
import { ORM_CONNECTION } from "./connection";
import { Model } from "./model";
import type { DatabaseOptions } from "./config";

class Note extends Model {
  static readonly table = "notes";
  id: number;
  body: string;
}

const apps: MeghApplication[] = [];
function createApp(
  options: Parameters<typeof MeghApplication.getInternalApp>[0] = {},
) {
  const app = MeghApplication.getInternalApp({
    autoloadPlugins: false,
    ...options,
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  delete process.env.DATABASE_URL;
});

describe("app.useMeghORM", () => {
  it("creates the connection from settings, with no Kysely in the app", async () => {
    const app = createApp().useMeghORM({
      dialect: "sqlite",
      database: ":memory:",
    });

    await Model.db()
      .schema.createTable("notes")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("body", "text")
      .execute();
    await Note.create({ body: "hello" });

    expect(await Note.count()).toBe(1);
    expect(Container.get(ORM_CONNECTION)).toBe(Model.db());
    expect(app.getPlugins()).toEqual([]);
  });

  it("reads DATABASE_URL when given no settings", async () => {
    process.env.DATABASE_URL = "sqlite::memory:";
    createApp().useMeghORM();
    await expect(
      Model.db()
        .selectNoFrom((eb) => eb.lit(1).as("one"))
        .execute(),
    ).resolves.toEqual([{ one: 1 }]);
  });

  it("takes settings from an @AppConfig class", async () => {
    @AppConfig
    class DatabaseConfig extends MeghConfig<DatabaseOptions> {
      config(): DatabaseOptions {
        return { url: "sqlite::memory:" };
      }
    }
    createApp().useMeghORM(DatabaseConfig);
    await expect(
      Model.db()
        .selectNoFrom((eb) => eb.lit(1).as("one"))
        .execute(),
    ).resolves.toEqual([{ one: 1 }]);
  });

  it("checks the connection when the app starts", async () => {
    const app = createApp().useMeghORM({
      dialect: "sqlite",
      database: "/nonexistent-dir/megh/app.db",
    });
    await expect(app.run(0)).rejects.toThrow(
      "Could not connect to sqlite /nonexistent-dir/megh/app.db",
    );
  });

  it("explains how to install a missing driver", () => {
    expect(() =>
      createApp().useMeghORM({ url: "mssql://sa:pw@localhost/app" }),
    ).toThrow(/npm install tedious/);
  });

  it("explains what to configure when nothing is set", () => {
    expect(() => createApp().useMeghORM()).toThrow(/Set DATABASE_URL/);
  });

  it("is replaced by an installed plugin with the same name", () => {
    const app = createApp({
      plugins: [
        definePlugin({
          name: "@meghjs/orm",
          register(ctx) {
            ctx.extend("useMeghORM", () => "from package");
          },
        }),
      ],
    });
    expect((app as any).useMeghORM()).toBe("from package");
    expect(app.getPlugins()).toEqual(["@meghjs/orm"]);
  });
});
