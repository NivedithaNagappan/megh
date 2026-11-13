import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { CliError } from "../errors";
import { c, log } from "../utils/log";
import { kebabCase, titleCase } from "../utils/names";
import { renderEntrySeeder } from "../generators/make";
import { cliVersion, coreRange, renderStub } from "../utils/stubs";
import { ENV_TYPES_FILE, envTypesFile } from "../utils/env-types";

export const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const FEATURES = ["openapi", "cors", "orm", "typeorm", "knex", "scalar", "mail"] as const;
export type Feature = (typeof FEATURES)[number];
const DEFAULT_FEATURES: Feature[] = ["openapi"];

/** Databases MeghORM (the `orm` feature) can connect to. */
export const DATABASES = ["postgres", "mysql", "sqlite", "mssql"] as const;
export type DatabaseKind = (typeof DATABASES)[number];
/** SQLite needs no server, so a project made with `--yes` runs straight away. */
const DEFAULT_DATABASE: DatabaseKind = "sqlite";

/** Per database: the driver packages, and the `DATABASE_URL` written to `.env`. */
const DATABASE_SETUP: Record<DatabaseKind, { drivers: string[]; url: string }> = {
  postgres: { drivers: ["pg"], url: "postgres://postgres:postgres@localhost:5432/{name}" },
  mysql: { drivers: ["mysql2"], url: "mysql://root:root@localhost:3306/{name}" },
  sqlite: { drivers: ["better-sqlite3"], url: "sqlite:./database.sqlite" },
  mssql: {
    drivers: ["tedious", "tarn"],
    url: "mssql://sa:YourStrong!Passw0rd@localhost:1433/{name}?trustServerCertificate=true",
  },
};

export type NewOptions = {
  cwd?: string;
  minimal?: boolean;
  force?: boolean;
  /** Skip prompts and use defaults for anything not given. */
  yes?: boolean;
  pm?: string;
  features?: string[];
  /** Database for the `orm` feature: postgres, mysql, sqlite or mssql. Implies `orm`. */
  database?: string;
  /** Skip `<pm> install`. Also enabled by the `MEGH_SKIP_INSTALL=1` environment variable. */
  skipInstall?: boolean;
  /** Skip `git init`. Also enabled by the `MEGH_SKIP_GIT=1` environment variable. */
  skipGit?: boolean;
};

/** Third-party versions for generated projects. */
const DEP_VERSIONS: Record<string, string> = {
  "class-transformer": "^0.5.1",
  "class-validator": "^0.14.2",
  "reflect-metadata": "^0.2.2",
  "@fastify/cors": "^11.0.0",
  "@fastify/swagger": "^9.7.0",
  "@fastify/swagger-ui": "^6.1.2",
  typeorm: "^0.3.20",
  pg: "^8.11.0",
  mysql2: "^3.11.0",
  "better-sqlite3": "^12.0.0",
  tedious: "^19.0.0",
  tarn: "^3.0.2",
  knex: "^3.1.0",
  "@scalar/fastify-api-reference": "^1.0.0",
  nodemailer: "^10.5.0",
  typescript: "^5.7.2",
  "@types/node": "^22.20.5",
  vitest: "^4.1.12",
  "@vitest/coverage-v8": "^4.1.12",
  "unplugin-swc": "^2.0.0",
  "@swc/core": "^1.16.20",
  "@faker-js/faker": "^10.6.0",
};

function isDirEmpty(dir: string) {
  return fs.readdirSync(dir).length === 0;
}

function validateFeatures(features: string[]): Feature[] {
  const unknown = features.filter((f) => !(FEATURES as readonly string[]).includes(f));
  if (unknown.length) {
    throw new CliError(`Unknown feature(s): ${unknown.join(", ")}. Choose from: ${FEATURES.join(", ")}.`);
  }
  return features as Feature[];
}

type Answers = { pm: PackageManager; features: Feature[]; database?: DatabaseKind };

async function prompt(opts: NewOptions): Promise<Answers> {
  if (opts.pm && !(PACKAGE_MANAGERS as readonly string[]).includes(opts.pm)) {
    throw new CliError(`Unknown package manager "${opts.pm}". Choose from: ${PACKAGE_MANAGERS.join(", ")}.`);
  }
  if (opts.database && !(DATABASES as readonly string[]).includes(opts.database)) {
    throw new CliError(`Unknown database "${opts.database}". Choose from: ${DATABASES.join(", ")}.`);
  }
  if (opts.database && opts.minimal) {
    throw new CliError("--database sets up MeghORM, which needs a full project. Leave out --minimal.");
  }
  const interactive = !opts.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;
  let pm = opts.pm as PackageManager | undefined;
  let features = opts.features ? validateFeatures(opts.features) : undefined;
  if (opts.minimal) features = [];
  let database = opts.database as DatabaseKind | undefined;
  // --database implies the ORM.
  if (database && features && !features.includes("orm")) features = [...features, "orm"];

  if (interactive && (!pm || !features)) {
    const { default: inquirer } = await import("inquirer");
    if (!pm) {
      ({ pm } = await inquirer.prompt([
        {
          type: "list",
          name: "pm",
          message: "Package manager:",
          choices: [...PACKAGE_MANAGERS],
          default: "npm",
        },
      ]));
    }
    if (!features) {
      ({ features } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "features",
          message: "Select features to include:",
          choices: [
            { name: "OpenAPI / Swagger docs", value: "openapi", checked: true },
            { name: "CORS support", value: "cors" },
            { name: "MeghORM: models, migrations and a query builder", value: "orm", checked: !!database },
            { name: "TypeORM", value: "typeorm" },
            { name: "Knex", value: "knex" },
            { name: "Scalar UI (replaces Swagger UI)", value: "scalar" },
            { name: "Mail: mailables, SMTP and API mailers, queued mail", value: "mail" },
          ],
        },
      ]));
    }
    if (features!.includes("orm") && !database) {
      ({ database } = await inquirer.prompt([
        {
          type: "list",
          name: "database",
          message: "Database:",
          choices: [
            { name: "PostgreSQL", value: "postgres" },
            { name: "MySQL / MariaDB", value: "mysql" },
            { name: "SQLite (a file, no server)", value: "sqlite" },
            { name: "SQL Server", value: "mssql" },
          ],
          default: DEFAULT_DATABASE,
        },
      ]));
    }
  }
  const chosen = features ?? (database ? [...DEFAULT_FEATURES, "orm" as const] : DEFAULT_FEATURES);
  return {
    pm: pm ?? "npm",
    features: chosen,
    database: chosen.includes("orm") ? (database ?? DEFAULT_DATABASE) : undefined,
  };
}

export function packageJson(
  name: string,
  features: Feature[],
  minimal: boolean,
  database: DatabaseKind = DEFAULT_DATABASE,
): string {
  const v = cliVersion();
  const deps: Record<string, string> = {
    "@meghjs/core": coreRange(),
    "@meghjs/cli": `^${v}`,
  };
  const pick = (...names: string[]) => names.forEach((n) => (deps[n] = DEP_VERSIONS[n]));
  pick("class-transformer", "class-validator", "reflect-metadata");
  if (features.includes("cors")) pick("@fastify/cors");
  if (usesData(features)) deps["@meghjs/data"] = `^${v}`;
  if (features.includes("typeorm")) pick("typeorm", "pg");
  if (features.includes("knex")) pick("knex", "pg");
  if (features.includes("orm")) pick(...DATABASE_SETUP[database].drivers);
  // useOpenApi() builds the spec with @fastify/swagger, then serves it with
  // Swagger UI, or with Scalar when that is chosen.
  if (features.includes("openapi") || features.includes("scalar")) pick("@fastify/swagger");
  if (features.includes("scalar")) pick("@scalar/fastify-api-reference");
  else if (features.includes("openapi")) pick("@fastify/swagger-ui");
  if (features.includes("mail")) pick("nodemailer");

  const devDeps: Record<string, string> = {};
  const pickDev = (...names: string[]) => names.forEach((n) => (devDeps[n] = DEP_VERSIONS[n]));
  pickDev("@types/node", "typescript");
  if (!minimal) pickDev("@swc/core", "@vitest/coverage-v8", "unplugin-swc", "vitest");
  // Model factories (megh make:factory) fill rows with Faker values.
  if (features.includes("orm")) pickDev("@faker-js/faker");

  const scripts: Record<string, string> = {
    "start:dev": "megh serve",
    build: "megh build",
    start: "megh start",
  };
  if (!minimal) {
    Object.assign(scripts, {
      test: "vitest run",
      "test:watch": "vitest",
      "test:cov": "vitest run --coverage",
      "test:e2e": "vitest run --config vitest.e2e.config.mts",
    });
  }

  const pkg: Record<string, any> = {
    name: kebabCase(name) || "megh-app",
    version: "0.0.1",
    private: true,
    description: `${titleCase(name)} API built with Megh`,
    main: "dist/serve.js",
    scripts,
    keywords: ["megh", "nodejs", "typescript"],
    engines: { node: ">=22" },
    dependencies: sortKeys(deps),
    devDependencies: sortKeys(devDeps),
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

/** TypeORM and Knex come from the @meghjs/data plugin. */
function usesData(features: Feature[]) {
  return features.includes("typeorm") || features.includes("knex");
}

function sortKeys(obj: Record<string, string>) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

function appSource(features: Feature[]) {
  const imports: string[] = [];
  const setup: string[] = [];
  if (features.includes("openapi") || features.includes("scalar")) {
    imports.push(`import { OpenApiConfig } from './config/openapi.config';`);
  }
  if (features.includes("cors")) setup.push(`app.useCors({ origin: '*' });`);
  if (imports.length) setup.push(`if (app.isDevelopment()) {\n  app.useOpenApi(OpenApiConfig);\n}`);
  if (features.includes("orm")) {
    setup.push(`// Connects from DATABASE_URL in .env; megh migrate uses the same setting.\napp.useMeghORM();`);
  }
  if (features.includes("mail")) {
    setup.push(`// Settings come from MEGH_MAIL_* in .env. Inject Mailer to send a Mailable.\napp.useMail();`);
  }
  if (features.includes("typeorm")) {
    setup.push(
      `// TODO: pass your TypeORM DataSourceOptions (or an @AppConfig class)\n` +
        `// await app.useTypeORM({ type: 'postgres', url: process.env.DATABASE_URL, entities: [] });`,
    );
  }
  if (features.includes("knex")) {
    setup.push(
      `// TODO: pass your Knex config (or an @AppConfig class)\n` +
        `// await app.useKnex({ client: 'pg', connection: process.env.DATABASE_URL });`,
    );
  }
  return renderStub("project/app.stub", {
    Imports: imports.map((i) => i + "\n").join(""),
    Setup: setup.map((s) => "\n" + s + "\n").join(""),
  });
}

/**
 * The mail section of `.env`. No mailer is set: in development mail is then
 * written to the log, and in production the app refuses to start until one is.
 */
function mailEnv(appTitle: string) {
  return [
    "",
    "# Mail: app.useMail(). With no MEGH_MAIL_MAILER, mail goes to the log in",
    "# development, and the app will not start in production until one is set.",
    "# MEGH_MAIL_MAILER=smtp",
    "# MEGH_MAIL_HOST=127.0.0.1",
    "# MEGH_MAIL_PORT=1025",
    "# MEGH_MAIL_USERNAME=",
    "# MEGH_MAIL_PASSWORD=",
    "# MEGH_MAIL_ENCRYPTION=tls",
    "# Or an API mailer: sendgrid, mailgun, postmark or resend.",
    "# MEGH_MAIL_SENDGRID_API_KEY=",
    "MEGH_MAIL_FROM_ADDRESS=hello@example.com",
    `MEGH_MAIL_FROM_NAME="${appTitle.replace(/"/g, "")}"`,
    "",
  ].join("\n");
}

export function installCommand(pm: PackageManager) {
  return `${pm} install`;
}

export function devCommand(pm: PackageManager) {
  return pm === "npm" ? "npm run start:dev" : `${pm} start:dev`;
}

function runInstall(pm: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Windows needs a shell to run npm.cmd/yarn.cmd/pnpm.cmd. Passing one command
    // string (not an args array) keeps Node 24 from warning with DEP0190.
    const child =
      process.platform === "win32"
        ? spawn(`${pm} install`, { cwd, stdio: "inherit", shell: true })
        : spawn(pm, ["install"], { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${pm} install exited with code ${code}`))));
  });
}

type GitResult = "initialized" | "no-git" | "inside-repo" | "failed";

/**
 * Run `git init` in a new project. Skipped when git is not installed, or when
 * the folder is already inside a repository (e.g. `megh new .` in a repo).
 */
export function initGit(cwd: string): GitResult {
  const git = (...args: string[]) => spawnSync("git", args, { cwd, stdio: "ignore" });
  const version = git("--version");
  if (version.error || version.status !== 0) return "no-git";
  if (git("rev-parse", "--is-inside-work-tree").status === 0) return "inside-repo";
  return git("init").status === 0 ? "initialized" : "failed";
}

export async function createApplication(name: string, opts: NewOptions = {}): Promise<string> {
  if (!name || !name.trim()) throw new CliError("Please provide a project name, e.g. `megh new my-api`.");
  const cwd = opts.cwd ?? process.cwd();
  const root = path.resolve(cwd, name);
  const appName = path.basename(root);
  const minimal = !!opts.minimal;

  if (fs.existsSync(root)) {
    if (!fs.statSync(root).isDirectory()) throw new CliError(`${root} exists and is not a directory.`);
    if (!isDirEmpty(root) && !opts.force) {
      throw new CliError(`Directory ${root} is not empty. Use -f or --force to scaffold into it anyway.`);
    }
  }

  const { pm, features, database } = await prompt(opts);
  const orm = features.includes("orm") && database ? DATABASE_SETUP[database] : undefined;

  console.log();
  console.log(c.bold(c.cyan("  Megh")) + c.dim(` v${cliVersion()}`));
  console.log(`  ${c.dim("Creating project:")} ${c.bold(appName)}${minimal ? c.dim(" (minimal)") : ""}`);

  const rel = (f: string) => path.relative(cwd, f) || ".";
  const files: Array<[string, string]> = [];
  const add = (file: string, content: string) => files.push([path.join(root, file), content]);

  if (minimal) {
    add("src/app.ts", renderStub("project/app-minimal.stub"));
  } else {
    add("src/services/home.service.ts", renderStub("project/home.service.stub"));
    add("src/controllers/home.controller.ts", renderStub("project/home.controller.stub"));
    add("src/controllers/home.controller.spec.ts", renderStub("project/home.controller.spec.stub"));
    if (features.includes("openapi") || features.includes("scalar")) {
      add(
        "src/config/openapi.config.ts",
        renderStub("project/openapi.config.stub", {
          AppTitle: titleCase(appName) || appName,
          Provider: features.includes("scalar") ? "\n      provider: 'scalar'," : "",
        }),
      );
    }
    add("src/app.ts", appSource(features));
    add("vitest.config.mts", renderStub("project/vitest.config.stub"));
    add("vitest.e2e.config.mts", renderStub("project/vitest-e2e.config.stub"));
  }
  add("src/serve.ts", renderStub("project/serve.stub"));
  add("package.json", packageJson(appName, features, minimal, database));
  add("tsconfig.json", renderStub("project/tsconfig.stub"));
  add(ENV_TYPES_FILE, envTypesFile(usesData(features) ? ["@meghjs/data"] : []));
  add("tsconfig.build.json", renderStub("project/tsconfig.build.stub"));
  let gitignore = renderStub("project/gitignore.stub");
  let env = renderStub("project/env.stub");
  if (orm) {
    const url = orm.url.replace("{name}", kebabCase(appName).replace(/-/g, "_") || "app");
    env = env.replace(/\n*$/, "\n") + `\n# MeghORM: app.useMeghORM() and megh migrate connect with this.\nDATABASE_URL=${url}\n`;
    if (database === "sqlite") gitignore = gitignore.replace(/\n*$/, "\n") + "database.sqlite\n";
    add("src/database/migrations/.gitkeep", "");
    add("src/database/seeders/database.seeder.ts", renderEntrySeeder([]));
  }
  if (features.includes("mail")) {
    env = env.replace(/\n*$/, "\n") + mailEnv(titleCase(appName) || appName);
    add("src/mail/welcome.mail.ts", renderStub("mail/mail.stub", { ClassName: "WelcomeMail", Title: "Welcome" }));
  }
  add(".gitignore", gitignore);
  add(".env", env);
  add(
    "README.md",
    renderStub("project/readme.stub", {
      AppTitle: titleCase(appName) || appName,
      InstallCmd: installCommand(pm),
      DevCmd: devCommand(pm),
      TestRow: minimal ? "" : "| `test`      | Run unit tests |\n",
      Tree: minimal
        ? ""
        : "├── controllers/   # Route controllers\n├── services/      # Business logic\n├── config/        # App configuration\n",
    }),
  );

  log.section("Generating files");
  for (const [file, content] of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    log.step(path.relative(root, file).split(path.sep).join("/"), "");
  }
  if (!minimal) fs.mkdirSync(path.join(root, "public"), { recursive: true });

  if (!opts.skipGit && process.env.MEGH_SKIP_GIT !== "1") {
    const git = initGit(root);
    if (git === "initialized") log.success("Initialized a git repository");
    else if (git === "failed") log.warn("git init failed; run it yourself to put the project under git");
  }

  const skipInstall = opts.skipInstall || process.env.MEGH_SKIP_INSTALL === "1";
  if (skipInstall) {
    log.section("Skipping dependency install");
  } else {
    log.section(`Installing dependencies (${pm})`);
    try {
      await runInstall(pm, root);
      log.success("Dependencies installed");
    } catch (err) {
      log.error(`Install failed: ${err instanceof Error ? err.message : err}`);
      log.info(`  Run it manually: cd ${rel(root)} && ${installCommand(pm)}`);
    }
  }

  console.log();
  log.success(c.green("Project created."));
  console.log(`\n  ${c.dim("Next steps:")}`);
  if (rel(root) !== ".") console.log(c.cyan(`    cd ${rel(root)}`));
  if (skipInstall) console.log(c.cyan(`    ${installCommand(pm)}`));
  if (orm) {
    if (database !== "sqlite") console.log(c.dim("    # set DATABASE_URL in .env"));
    console.log(c.cyan("    npx megh make:migration create_users_table"));
    console.log(c.cyan("    npx megh migrate --seed"));
  }
  console.log(c.cyan(`    ${devCommand(pm)}`));
  if (features.includes("openapi") || features.includes("scalar")) {
    console.log(`\n  ${c.dim("API docs:")} http://localhost:4000/docs`);
  }
  console.log();
  return root;
}
