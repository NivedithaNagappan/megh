import fs from "fs";
import path from "path";
import { CliError } from "../errors";
import { log } from "../utils/log";
import { resolveName, snakeCase } from "../utils/names";
import { installedVersion, requireProjectRoot, writeFileSafe } from "../utils/project";
import { renderStub } from "../utils/stubs";
import { databasePaths } from "../commands/migrate";

export type MakeBaseOptions = {
  /** Directory to start the project-root search from. Defaults to `process.cwd()`. */
  cwd?: string;
  force?: boolean;
  /** Folder under `src/` to write to instead of the default one. */
  root?: string;
};

export type MakeModelOptions = MakeBaseOptions & { orm?: boolean };
export type MakeServiceOptions = MakeBaseOptions & { resource?: boolean; model?: string; orm?: boolean };
export type MakeControllerOptions = MakeServiceOptions & { basePath?: boolean };

const DEFAULT_DIRS = {
  model: "models",
  service: "services",
  controller: "controllers",
  config: "config",
  middleware: "middlewares",
  dto: "dtos",
} as const;

type Kind = keyof typeof DEFAULT_DIRS;

function targetDir(projectRoot: string, kind: Kind, dirs: string[], root?: string): string {
  const folder = root ? root.split(/[\\/]+/).filter(Boolean) : [DEFAULT_DIRS[kind]];
  if (folder.some((p) => p === "..")) throw new CliError(`Invalid --root "${root}".`);
  return path.join(projectRoot, "src", ...folder, ...dirs);
}

/** A relative module specifier from `fromFile` to `toFile` (without extension), always using `/`. */
function importPath(fromFile: string, toFile: string): string {
  let rel = path.relative(path.dirname(fromFile), toFile).replace(/\.ts$/, "").split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function write(file: string, content: string, force: boolean | undefined, label: string, projectRoot: string) {
  writeFileSafe(file, content, force);
  log.success(`${label} created: ${path.relative(projectRoot, file).split(path.sep).join("/")}`);
  return file;
}

/**
 * Write a dependency of the requested file (the model behind a service, or the
 * service behind a controller). An existing file is always kept and reused.
 */
function ensureDependency(file: string, render: () => string, label: string, projectRoot: string) {
  const rel = path.relative(projectRoot, file).split(path.sep).join("/");
  if (fs.existsSync(file)) {
    log.info(`  ${label} exists, reusing: ${rel}`);
    return;
  }
  write(file, render(), false, label, projectRoot);
}

export function makeModel(name: string, opts: MakeModelOptions = {}): string {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const n = resolveName(name, "Model");
  const file = path.join(targetDir(projectRoot, "model", n.dirs, opts.root), `${n.fileBase}.model.ts`);
  return write(file, renderModel(n.base, opts.orm), opts.force, "Model", projectRoot);
}

function renderModel(model: string, orm?: boolean) {
  return renderStub(orm ? "models/entity-model.stub" : "models/basic-model.stub", {
    Model: model,
    table: snakeCase(model),
  });
}

/**
 * Write a resource service for `model` at `serviceFile`, plus the model under
 * `src/models` if it does not exist yet, so the generated code compiles.
 */
function writeResourceService(
  projectRoot: string,
  serviceFile: string,
  serviceClass: string,
  model: string,
  orm: boolean | undefined,
  force: boolean | undefined,
  asDependency: boolean,
) {
  const m = resolveName(model, "Model");
  const modelFile = path.join(targetDir(projectRoot, "model", m.dirs), `${m.fileBase}.model.ts`);
  const render = () =>
    renderStub(orm ? "services/orm-rest-service.stub" : "services/rest-service.stub", {
      ClassName: serviceClass,
      Model: m.base,
      modelVar: m.varName,
      modelImport: importPath(serviceFile, modelFile),
    });
  if (asDependency) ensureDependency(serviceFile, render, "Service", projectRoot);
  else write(serviceFile, render(), force, "Service", projectRoot);
  ensureDependency(modelFile, () => renderModel(m.base, orm), "Model", projectRoot);
  if (orm && !installedVersion("@meghjs/data", projectRoot)) {
    log.warn("The generated service uses @meghjs/data. Install it: npm install @meghjs/data typeorm");
  }
}

export function makeService(name: string, opts: MakeServiceOptions = {}): string {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const n = resolveName(name, "Service");
  const file = path.join(targetDir(projectRoot, "service", n.dirs, opts.root), `${n.fileBase}.service.ts`);
  if (opts.resource && !opts.model) {
    throw new CliError("A resource service needs a model: pass -m <model> (or --model <model>).");
  }
  if (opts.model) {
    writeResourceService(projectRoot, file, n.className, opts.model, opts.orm, opts.force, false);
    return file;
  }
  return write(file, renderStub("services/basic-service.stub", { ClassName: n.className }), opts.force, "Service", projectRoot);
}

export function makeController(name: string, opts: MakeControllerOptions = {}): string {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const n = resolveName(name, "Controller");
  const file = path.join(targetDir(projectRoot, "controller", n.dirs, opts.root), `${n.fileBase}.controller.ts`);
  if (fs.existsSync(file) && !opts.force) {
    throw new CliError(`${file} already exists. Use -f or --force to overwrite it.`);
  }
  const route = [...n.dirs, `${n.fileBase}s`].join("/");

  let content: string;
  if (opts.model) {
    const m = resolveName(opts.model, "Model");
    const serviceClass = `${m.base}Service`;
    const serviceFile = path.join(targetDir(projectRoot, "service", []), `${m.fileBase}.service.ts`);
    content = renderStub("controllers/resource-controller.stub", {
      ClassName: n.className,
      route,
      Model: m.base,
      modelVar: m.varName,
      ServiceClass: serviceClass,
      serviceVar: `${m.varName}Service`,
      serviceImport: importPath(file, serviceFile),
    });
    // Dependencies first, so a failure leaves no controller pointing at missing files.
    writeResourceService(projectRoot, serviceFile, serviceClass, opts.model, opts.orm, false, true);
  } else {
    const stub = opts.resource ? "controllers/rest-controller.stub" : "controllers/basic-controller.stub";
    content = renderStub(stub, { ClassName: n.className, route });
  }
  if (opts.basePath) {
    content = content.replace(/@ApiController\s*\(([^)]*)\)/, "@ApiController");
  }
  write(file, content, opts.force, "Controller", projectRoot);
  log.info(`  Register it in your app: app.useControllers([..., ${n.className}])`);
  return file;
}

export function makeConfig(name: string, opts: MakeBaseOptions = {}): string {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const n = resolveName(name, "Config");
  const file = path.join(targetDir(projectRoot, "config", n.dirs, opts.root), `${n.fileBase}.config.ts`);
  return write(file, renderStub("config/config.stub", { ClassName: n.className }), opts.force, "Config", projectRoot);
}

export function makeMiddleware(name: string, opts: MakeBaseOptions = {}): string {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const n = resolveName(name, "Middleware");
  const file = path.join(targetDir(projectRoot, "middleware", n.dirs, opts.root), `${n.fileBase}.middleware.ts`);
  return write(file, renderStub("middlewares/middleware.stub", { ClassName: n.className }), opts.force, "Middleware", projectRoot);
}

export function makeDto(name: string, opts: MakeBaseOptions = {}): string {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const n = resolveName(name, "Dto");
  const file = path.join(targetDir(projectRoot, "dto", n.dirs, opts.root), `${n.fileBase}.dto.ts`);
  return write(file, renderStub("dtos/dto.stub", { ClassName: n.className }), opts.force, "DTO", projectRoot);
}

export type MakeMigrationOptions = Pick<MakeBaseOptions, "cwd" | "force"> & {
  /** Create this table (overrides the name-based guess). */
  create?: string;
  /** Alter this table (overrides the name-based guess). */
  table?: string;
  /** Clock for the file name's timestamp (tests). */
  now?: Date;
};

/** `YYYYMMDDHHmmss` in local time: migrations run in file-name order. */
export function migrationTimestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

/** The `id` column for the project's database driver. */
function idColumn(pkg: Record<string, any>): string {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps.pg || deps.postgres) return `.addColumn("id", "serial", (col) => col.primaryKey())`;
  if (deps.tedious) return `.addColumn("id", "integer", (col) => col.identity().primaryKey())`;
  return `.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())`;
}

/**
 * Create `<migrations>/<timestamp>_<name>.ts`. `create_<table>_table` gives a
 * create-table migration, `add_x_to_<table>_table` (also from/in, and
 * remove/drop/alter/change/update) an alter-table one, anything else a blank one.
 */
export function makeMigration(name: string, opts: MakeMigrationOptions = {}): string {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const snake = snakeCase(name);
  if (!snake) throw new CliError(`Invalid migration name "${name}".`);
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const { migrations } = databasePaths(projectRoot, pkg);

  const createTable =
    opts.create ?? (opts.table ? undefined : snake.match(/^create_(\w+?)_table$/)?.[1]);
  const alterTable =
    opts.table ??
    (opts.create ? undefined : snake.match(/^(?:add|remove|drop|alter|change|update)_\w+_(?:to|from|in|on)_(\w+?)_table$/)?.[1]);

  const content = createTable
    ? renderStub("migrations/create-table.stub", { table: createTable, idColumn: idColumn(pkg) })
    : alterTable
      ? renderStub("migrations/alter-table.stub", { table: alterTable })
      : renderStub("migrations/migration.stub");

  const file = path.join(migrations, `${migrationTimestamp(opts.now)}_${snake}.ts`);
  return write(file, content, opts.force, "Migration", projectRoot);
}
