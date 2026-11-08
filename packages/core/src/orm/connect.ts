/**
 * Builds the ORM's Kysely instance from connection settings, so apps never
 * create one themselves. Kysely ships with Megh; the database driver is the
 * app's own dependency and is loaded from it.
 */
import type { Dialect as KyselyDialect, Kysely } from "kysely";
import { loadPackageFromClient } from "./core";
import { kysely } from "./engine";
import {
  DatabaseConfigError,
  describeConnection,
  type Dialect,
  type ResolvedDatabaseOptions,
} from "./config";

const DRIVERS: Record<Dialect, string[]> = {
  postgres: ["pg"],
  mysql: ["mysql2"],
  sqlite: ["better-sqlite3"],
  mssql: ["tedious", "tarn"],
};

/** Load the driver packages a dialect needs, or explain how to install them. */
function drivers(dialect: Dialect): any[] {
  const missing: string[] = [];
  const loaded = DRIVERS[dialect].map((name) => {
    try {
      return loadPackageFromClient(name);
    } catch {
      missing.push(name);
      return undefined;
    }
  });
  if (missing.length) {
    throw new DatabaseConfigError(
      `The ${dialect} connection needs ${missing.map((m) => `"${m}"`).join(" and ")}. Install it: npm install ${missing.join(" ")}`,
    );
  }
  return loaded;
}

function defaultExport(mod: any): any {
  return mod?.default ?? mod;
}

function postgres(o: ResolvedDatabaseOptions): KyselyDialect {
  const [pg] = drivers("postgres");
  const Pool = pg.Pool ?? defaultExport(pg).Pool;
  return new (kysely().PostgresDialect)({
    pool: new Pool({
      connectionString: o.url,
      host: o.host,
      port: o.port,
      user: o.user,
      password: o.password,
      database: o.database,
      min: o.pool.min,
      max: o.pool.max,
      ssl: o.ssl,
    }),
  });
}

function mysql(o: ResolvedDatabaseOptions): KyselyDialect {
  const [mysql2] = drivers("mysql");
  const settings = {
    host: o.host,
    port: o.port,
    user: o.user,
    password: o.password,
    database: o.database,
    connectionLimit: o.pool.max,
    ssl: o.ssl === true ? {} : o.ssl || undefined,
  };
  return new (kysely().MysqlDialect)({
    pool: defaultExport(mysql2).createPool(
      o.url ? { uri: o.url, ...stripUndefined(settings) } : settings,
    ),
  });
}

function sqlite(o: ResolvedDatabaseOptions): KyselyDialect {
  const [BetterSqlite3] = drivers("sqlite");
  const Database = defaultExport(BetterSqlite3);
  // A factory, so a bad path fails on the first query (the startup check)
  // rather than when the app is created.
  return new (kysely().SqliteDialect)({
    database: async () => new Database(o.database),
  });
}

/** SQL Server settings from an `mssql://user:pass@host:1433/db?encrypt=false` URL. */
function mssqlUrl(url: string): Partial<ResolvedDatabaseOptions> {
  const parsed = new URL(url);
  const flag = (name: string) => {
    const value = parsed.searchParams.get(name);
    return value === null ? undefined : value === "true";
  };
  return stripUndefined({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : undefined,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: parsed.pathname.replace(/^\//, "") || undefined,
    ssl: flag("encrypt"),
    trustServerCertificate: flag("trustServerCertificate"),
  });
}

function mssql(options: ResolvedDatabaseOptions): KyselyDialect {
  const [tedious, tarn] = drivers("mssql");
  const o = options.url
    ? {
        ...mssqlUrl(options.url),
        ...stripUndefined({ ...options, url: undefined }),
      }
    : options;
  const Tedious = defaultExport(tedious);
  const dialect = new (kysely().MssqlDialect)({
    tarn: {
      ...defaultExport(tarn),
      options: { min: options.pool.min ?? 0, max: options.pool.max ?? 10 },
    },
    tedious: {
      ...Tedious,
      connectionFactory: () =>
        new Tedious.Connection({
          server: o.host,
          authentication: {
            type: "default",
            options: { userName: o.user, password: o.password },
          },
          options: {
            port: o.port ?? 1433,
            database: o.database,
            encrypt: o.ssl !== false,
            trustServerCertificate: o.trustServerCertificate ?? false,
          },
        }),
    },
  });
  return withSqlServerErrors(dialect);
}

/** SQL Server: "The ROLLBACK TRANSACTION request has no corresponding BEGIN TRANSACTION." */
const NO_OPEN_TRANSACTION = 3903;

/**
 * Kysely rejects with a bare array when SQL Server sends several messages
 * for one statement (a bad foreign key gives 1767 "references invalid
 * table" and 1750 "Could not create constraint"). Merge them into one Error
 * whose message reads them in order, keeping `number` and `errors`.
 */
function toError(error: unknown): unknown {
  if (!Array.isArray(error) || error.length === 0) return error;
  const first = error[0] as { name?: string; number?: number } | undefined;
  return Object.assign(
    new Error(
      error.map((e) => (e instanceof Error ? e.message : String(e))).join(" "),
      { cause: first },
    ),
    {
      name: first?.name ?? "RequestError",
      number: first?.number,
      errors: error,
    },
  );
}

/**
 * Makes SQL Server's errors readable:
 *
 * - Some errors (a foreign key to a missing table, a conversion error, …)
 *   abort the whole transaction. The rollback that follows then fails with
 *   error 3903, and Kysely would report that instead of the error that
 *   caused it. The transaction is already gone, so 3903 is ignored and the
 *   original error comes through.
 * - Several messages for one statement arrive as one Error (see toError).
 */
export function withSqlServerErrors(dialect: KyselyDialect): KyselyDialect {
  const wrapped = new WeakSet<object>();
  return {
    createAdapter: () => dialect.createAdapter(),
    createIntrospector: (db) => dialect.createIntrospector(db),
    createQueryCompiler: () => dialect.createQueryCompiler(),
    createDriver: () => {
      const driver = dialect.createDriver();
      const acquire = driver.acquireConnection.bind(driver);
      driver.acquireConnection = async () => {
        const connection = await acquire();
        // Pooled connections come back again: wrap each one once.
        if (!wrapped.has(connection)) {
          wrapped.add(connection);
          const execute = connection.executeQuery.bind(connection);
          connection.executeQuery = async (query) => {
            try {
              return await execute(query);
            } catch (error) {
              throw toError(error);
            }
          };
        }
        return connection;
      };
      const rollback = driver.rollbackTransaction.bind(driver);
      driver.rollbackTransaction = async (...args) => {
        try {
          await rollback(...args);
        } catch (error) {
          if ((error as { number?: unknown })?.number !== NO_OPEN_TRANSACTION) {
            throw toError(error);
          }
        }
      };
      return driver;
    },
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

const FACTORIES: Record<
  Dialect,
  (o: ResolvedDatabaseOptions) => KyselyDialect
> = {
  postgres,
  mysql,
  sqlite,
  mssql,
};

/** A connection for `options`. Nothing connects until the first query. */
export function createDatabase(options: ResolvedDatabaseOptions): Kysely<any> {
  const { Kysely: KyselyClass } = kysely();
  return new KyselyClass<any>({ dialect: FACTORIES[options.dialect](options) });
}

/** Run a trivial query, so a wrong host or password fails at startup with a clear message. */
export async function verifyConnection(
  db: Kysely<any>,
  options: ResolvedDatabaseOptions,
): Promise<void> {
  try {
    await kysely().sql`select 1`.execute(db);
  } catch (err: any) {
    throw new DatabaseConfigError(
      `Could not connect to ${describeConnection(options)}: ${err?.message ?? err}`,
    );
  }
}
