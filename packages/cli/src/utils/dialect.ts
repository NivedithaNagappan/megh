import fs from "fs";
import path from "path";

export type Dialect = "postgres" | "mysql" | "sqlite" | "mssql";

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

const DIALECTS = new Set<string>(["postgres", "mysql", "sqlite", "mssql"]);

/** `KEY=value` pairs of a .env file (no expansion). */
function readDotEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

const fromUrl = (url: string | undefined): Dialect | undefined => {
  const scheme = url?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  return scheme ? SCHEMES[scheme] : undefined;
};

/**
 * The database the project's migrations run on, found the way
 * app.useMeghORM() finds it: `megh.database` in package.json, then
 * DB_DIALECT, then the scheme of DATABASE_URL (the environment over .env).
 * Undefined when nothing says.
 */
export function projectDialect(projectRoot: string): Dialect | undefined {
  let database: { dialect?: string; url?: string } = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    database = pkg?.megh?.database ?? {};
  } catch {
    // No or invalid package.json: use the environment.
  }
  const dotenv = readDotEnv(path.join(projectRoot, ".env"));
  const env = (key: string) => process.env[key] ?? dotenv[key];
  const named = database.dialect ?? env("DB_DIALECT");
  if (named && DIALECTS.has(named)) return named as Dialect;
  return fromUrl(database.url) ?? fromUrl(env("DATABASE_URL"));
}
