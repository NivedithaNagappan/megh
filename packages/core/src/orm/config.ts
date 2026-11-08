/**
 * Connection settings for `app.useMeghORM()` and `megh migrate`: given
 * directly, read from the environment, or both (given settings win).
 */
import type { NamingStrategy } from "./naming";

export type Dialect = "postgres" | "mysql" | "sqlite" | "mssql";

export const DIALECTS: readonly Dialect[] = [
  "postgres",
  "mysql",
  "sqlite",
  "mssql",
];

export interface PoolOptions {
  /** Connections kept open when idle. */
  min?: number;
  /** Most connections open at once. Defaults to 10. */
  max?: number;
}

export interface DatabaseOptions {
  /** Which database. Read from the `url` scheme when left out. */
  dialect?: Dialect;
  /**
   * Connection URL: `postgres://user:pass@host:5432/app`,
   * `mysql://…`, `mssql://…` (or `sqlserver://…`), `sqlite:./app.db`.
   */
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  /** Database name. For SQLite, the file path (or `:memory:`). */
  database?: string;
  pool?: PoolOptions;
  /**
   * Postgres and MySQL: `true`, or the driver's TLS options. SQL Server
   * encrypts by default; pass `false` to turn it off.
   */
  ssl?: boolean | Record<string, unknown>;
  /** SQL Server: accept a self-signed certificate (local development). */
  trustServerCertificate?: boolean;
  /**
   * How decorated properties map to columns when `@Column` gives no `name`:
   * `"preserve"` (default) uses the property name, `"snake_case"` maps
   * `createdAt` to `created_at`.
   */
  naming?: NamingStrategy;
}

/** Settings after the environment and URL are applied. */
export interface ResolvedDatabaseOptions extends DatabaseOptions {
  dialect: Dialect;
  pool: PoolOptions;
}

/** Reads one environment variable. */
export type EnvReader = (key: string) => string | undefined;

const SCHEMES: Record<string, Dialect> = {
  postgres: "postgres",
  postgresql: "postgres",
  mysql: "mysql",
  mariadb: "mysql",
  mssql: "mssql",
  sqlserver: "mssql",
  sqlite: "sqlite",
  file: "sqlite",
};

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(`[Megh ORM] ${message}`);
    this.name = "DatabaseConfigError";
  }
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function fromEnv(env: EnvReader): DatabaseOptions {
  const max = toNumber(env("DB_POOL_MAX"));
  const min = toNumber(env("DB_POOL_MIN"));
  return {
    dialect: env("DB_DIALECT") as Dialect | undefined,
    url: env("DATABASE_URL"),
    host: env("DB_HOST"),
    port: toNumber(env("DB_PORT")),
    user: env("DB_USER"),
    password: env("DB_PASSWORD"),
    database: env("DB_NAME"),
    pool: max !== undefined || min !== undefined ? { min, max } : undefined,
  };
}

function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;
}

/** The dialect a URL's scheme names, if any. */
export function dialectOfUrl(url: string): Dialect | undefined {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  return match ? SCHEMES[match[1].toLowerCase()] : undefined;
}

/** SQLite file from `sqlite:./app.db`, `sqlite://./app.db`, `file:app.db`, `sqlite::memory:`. */
function sqliteFile(url: string): string {
  return url.replace(/^(sqlite|file):(\/\/)?/i, "") || ":memory:";
}

/**
 * Merge `options` over the environment and fill in what the URL and dialect
 * imply. Throws a {@link DatabaseConfigError} naming what's missing.
 */
export function resolveDatabaseOptions(
  options: DatabaseOptions = {},
  env: EnvReader = (key) => process.env[key],
): ResolvedDatabaseOptions {
  const merged: DatabaseOptions = {
    ...defined(fromEnv(env)),
    ...defined(options),
  };
  // An explicit url replaces DB_HOST & co. from the environment, and the other way round.
  if (options.url) {
    for (const key of [
      "host",
      "port",
      "user",
      "password",
      "database",
    ] as const) {
      if (options[key] === undefined) delete merged[key];
    }
  } else if (options.host || options.database) {
    delete merged.url;
  }

  const dialect =
    merged.dialect ?? (merged.url ? dialectOfUrl(merged.url) : undefined);
  if (!dialect) {
    throw new DatabaseConfigError(
      merged.url
        ? `Can't tell the database from the URL "${redact(merged.url)}". Start it with postgres://, mysql://, mssql:// or sqlite:, or set the dialect.`
        : "No database configured. Set DATABASE_URL (or DB_DIALECT and DB_HOST, DB_NAME, …) in the environment, or pass the settings to app.useMeghORM({ dialect, url }).",
    );
  }
  if (!DIALECTS.includes(dialect)) {
    throw new DatabaseConfigError(
      `Unknown dialect "${dialect}". Use one of: ${DIALECTS.join(", ")}.`,
    );
  }

  const resolved: ResolvedDatabaseOptions = {
    ...merged,
    dialect,
    pool: { max: 10, ...merged.pool },
  };

  if (dialect === "sqlite") {
    resolved.database ??= merged.url ? sqliteFile(merged.url) : undefined;
    delete resolved.url;
    if (!resolved.database) {
      throw new DatabaseConfigError(
        "SQLite needs a file: set database to a path such as ./app.db (or :memory:), or a url like sqlite:./app.db.",
      );
    }
  } else if (!resolved.url && !resolved.host) {
    throw new DatabaseConfigError(
      `The ${dialect} connection needs a url, or a host and database.`,
    );
  }
  return resolved;
}

/** `url` with its password replaced, for messages and logs. */
export function redact(url: string): string {
  return url.replace(/(\/\/[^:/@]+:)[^@]*@/, "$1***@");
}

/** Where the connection points, without the password: `postgres db.local:5432/app`. */
export function describeConnection(options: ResolvedDatabaseOptions): string {
  if (options.dialect === "sqlite") return `sqlite ${options.database}`;
  if (options.url) return `${options.dialect} ${redact(options.url)}`;
  const port = options.port ? `:${options.port}` : "";
  return `${options.dialect} ${options.host}${port}/${options.database ?? ""}`;
}
