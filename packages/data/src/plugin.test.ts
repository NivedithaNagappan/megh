import "reflect-metadata";
import { afterEach, describe, expect, it } from "vitest";
import {
  AppConfig,
  MeghApplication,
  MeghConfig,
  MeghContainer,
  Injectable,
  type Environment,
} from "@meghjs/core";
import type { Knex } from "knex";
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from "typeorm";
import { dataPlugin } from "./plugin";
import { KnexDB } from "./knex-provider";
import { InjectRepository, type PaginatedRepository } from "./repository";
import { getDataSource } from "./datasource";

const apps: MeghApplication[] = [];
function createApp() {
  const app = MeghApplication.getInternalApp({ plugins: [dataPlugin], autoloadPlugins: false });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  // Services such as KnexDB hold the connection they were built with.
  MeghContainer.reset();
});

const sqlite: Knex.Config = {
  client: "better-sqlite3",
  connection: { filename: ":memory:" },
  useNullAsDefault: true,
};

describe("useKnex", () => {
  it("connects, registers the connection for KnexDB and returns the app", async () => {
    const app = createApp();

    const returned = await app.useKnex(sqlite);

    expect(returned).toBe(app);
    const db = MeghContainer.get(KnexDB);
    await db.client.schema.createTable("users", (t) => {
      t.increments("id");
      t.string("name");
    });
    await db.client("users").insert([{ name: "a" }, { name: "b" }, { name: "c" }]);
    const page = await db.paginate(db.client("users").select("name"), { page: 2, perPage: 2 });
    expect(page.data).toEqual([{ name: "c" }]);
    expect(page.meta.total).toBe(3);
  });

  it("builds the config from an @AppConfig class", async () => {
    @AppConfig
    class DbConfig extends MeghConfig<Knex.Config> {
      config(_env: Environment) {
        return sqlite;
      }
    }
    const app = createApp();

    await app.useKnex(DbConfig);

    const row = await MeghContainer.get(KnexDB).client.raw("select 1 as one");
    expect(row).toEqual([{ one: 1 }]);
  });

  it("destroys the connection when the app closes", async () => {
    const app = createApp();
    await app.useKnex(sqlite);
    const client = MeghContainer.get(KnexDB).client;

    await app.close();

    await expect(client.raw("select 1")).rejects.toThrow();
  });

  it("rejects when the database is unreachable", async () => {
    const app = createApp();

    await expect(
      app.useKnex({ ...sqlite, connection: { filename: "/no/such/dir/db.sqlite" } }),
    ).rejects.toThrow();
  });
});

@Entity()
class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;
}

@Injectable()
class PostService {
  constructor(@InjectRepository(Post) readonly posts: PaginatedRepository<Post>) {}
}

describe("useTypeORM", () => {
  const options = {
    type: "better-sqlite3" as const,
    database: ":memory:",
    entities: [Post],
    synchronize: true,
  };

  it("initializes the DataSource and serves paginated repositories", async () => {
    const app = createApp();

    const returned = await app.useTypeORM(options);

    expect(returned).toBe(app);
    expect(MeghContainer.get(DataSource).isInitialized).toBe(true);
    const { posts } = MeghContainer.get(PostService);
    await posts.save([{ title: "one" }, { title: "two" }, { title: "three" }]);
    const page = await posts.paginate({ page: 1, perPage: 2 });
    expect(page.data.map((p) => p.title)).toEqual(["one", "two"]);
    expect(page.meta).toMatchObject({ total: 3, page: 1, perPage: 2, lastPage: 2 });
  });

  it("destroys the DataSource when the app closes", async () => {
    const app = createApp();
    await app.useTypeORM(options);
    const dataSource = getDataSource();

    await app.close();

    expect(dataSource.isInitialized).toBe(false);
  });
});
