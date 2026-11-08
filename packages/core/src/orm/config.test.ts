import { describe, expect, it } from "vitest";
import {
  DatabaseConfigError,
  describeConnection,
  resolveDatabaseOptions,
} from "./config";

const env =
  (vars: Record<string, string>) =>
  (key: string): string | undefined =>
    vars[key];
const none = env({});

describe("resolveDatabaseOptions", () => {
  it("reads the dialect from the URL scheme", () => {
    const cases: Record<string, string> = {
      "postgres://u:p@db:5432/app": "postgres",
      "postgresql://db/app": "postgres",
      "mysql://db/app": "mysql",
      "mariadb://db/app": "mysql",
      "mssql://db/app": "mssql",
      "sqlserver://db/app": "mssql",
      "sqlite:./app.db": "sqlite",
    };
    for (const [url, dialect] of Object.entries(cases)) {
      expect(resolveDatabaseOptions({ url }, none).dialect).toBe(dialect);
    }
  });

  it("reads DATABASE_URL and DB_* from the environment", () => {
    expect(
      resolveDatabaseOptions(
        undefined,
        env({ DATABASE_URL: "postgres://db/app", DB_POOL_MAX: "4" }),
      ),
    ).toMatchObject({
      dialect: "postgres",
      url: "postgres://db/app",
      pool: { max: 4 },
    });

    expect(
      resolveDatabaseOptions(
        undefined,
        env({
          DB_DIALECT: "mysql",
          DB_HOST: "db",
          DB_PORT: "3307",
          DB_USER: "root",
          DB_PASSWORD: "secret",
          DB_NAME: "app",
        }),
      ),
    ).toMatchObject({
      dialect: "mysql",
      host: "db",
      port: 3307,
      user: "root",
      password: "secret",
      database: "app",
    });
  });

  it("lets given settings override the environment", () => {
    const resolved = resolveDatabaseOptions(
      { url: "postgres://other/app", pool: { max: 2 } },
      env({ DATABASE_URL: "postgres://db/app", DB_HOST: "envhost" }),
    );
    expect(resolved.url).toBe("postgres://other/app");
    expect(resolved.host).toBeUndefined();
    expect(resolved.pool.max).toBe(2);
  });

  it("drops DATABASE_URL when a host is given", () => {
    const resolved = resolveDatabaseOptions(
      { dialect: "postgres", host: "db", database: "app" },
      env({ DATABASE_URL: "postgres://from-env/app" }),
    );
    expect(resolved.url).toBeUndefined();
    expect(resolved.host).toBe("db");
  });

  it("takes the SQLite file from the URL or database", () => {
    expect(
      resolveDatabaseOptions({ url: "sqlite:./app.db" }, none).database,
    ).toBe("./app.db");
    expect(
      resolveDatabaseOptions({ url: "sqlite::memory:" }, none).database,
    ).toBe(":memory:");
    expect(
      resolveDatabaseOptions({ dialect: "sqlite", database: "x.db" }, none)
        .database,
    ).toBe("x.db");
  });

  it("defaults the pool to 10 connections", () => {
    expect(
      resolveDatabaseOptions({ url: "mysql://db/app" }, none).pool,
    ).toEqual({ max: 10 });
  });

  it("explains what to set when nothing is configured", () => {
    expect(() => resolveDatabaseOptions({}, none)).toThrow(DatabaseConfigError);
    expect(() => resolveDatabaseOptions({}, none)).toThrow(/Set DATABASE_URL/);
  });

  it("rejects an unknown scheme without printing the password", () => {
    expect(() =>
      resolveDatabaseOptions({ url: "oracle://scott:tiger@db/app" }, none),
    ).toThrow(/oracle:\/\/scott:\*\*\*@db\/app/);
  });

  it("rejects an unknown dialect", () => {
    expect(() =>
      resolveDatabaseOptions({ dialect: "oracle" as any, host: "db" }, none),
    ).toThrow(/Unknown dialect "oracle"/);
  });

  it("needs a host or URL for server databases", () => {
    expect(() => resolveDatabaseOptions({ dialect: "postgres" }, none)).toThrow(
      /needs a url, or a host and database/,
    );
  });
});

describe("describeConnection", () => {
  it("hides the password", () => {
    expect(
      describeConnection(
        resolveDatabaseOptions(
          { url: "postgres://u:hunter2@db:5432/app" },
          none,
        ),
      ),
    ).toBe("postgres postgres://u:***@db:5432/app");
    expect(
      describeConnection(
        resolveDatabaseOptions(
          { dialect: "mssql", host: "db", port: 1433, database: "app" },
          none,
        ),
      ),
    ).toBe("mssql db:1433/app");
  });
});
