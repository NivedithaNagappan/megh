import fs from "fs";
import path from "path";
import { CliError } from "../errors";
import { databasePaths } from "../commands/migrate";
import { log } from "../utils/log";
import { pascalCase, resolveName, snakeCase } from "../utils/names";
import { requireProjectRoot, writeFileSafe } from "../utils/project";
import { generatedFiles, makeFactory, makeModel, makeResource, migrationTimestamp } from "./make";
import { readMigrationSchema } from "./migration-schema";
import { pluralize } from "./orm-model";
import { mergeFields, type FieldDef } from "../templates/fields";
import {
  allDomains,
  dependencies,
  findDomain,
  findTemplate,
  orderByDependencies,
  templateForTable,
  type Domain,
  type ModelTemplate,
} from "../templates";
import { renderCreateMigration } from "../templates/migration";
import { cascadeEdges, limitCascadePaths } from "../templates/cascade";
import { projectDialect } from "../utils/dialect";

/**
 * Scaffolding from templates: each template becomes a create-table
 * migration, and the usual generators (make:model, make:resource,
 * make:factory) build the model, DTOs, service, controller and factory from
 * that migration.
 */

export type ScaffoldMode = "migration" | "model" | "resource";

export type ScaffoldOptions = {
  cwd?: string;
  /** Overwrite the requested models' files (dependencies are never overwritten). */
  force?: boolean;
  /** What to generate for the requested templates. Dependencies get a model. */
  mode?: ScaffoldMode;
  /** Also write a factory for each model. */
  factory?: boolean;
  /** Create the tables foreign keys point to when no migration creates them. Defaults to true. */
  deps?: boolean;
  /** Prompt (pick templates, confirm dependencies) when run in a terminal. */
  interactive?: boolean;
  /** Clock for the migrations' timestamps (tests). */
  now?: Date;
  /** Reuse requested models that already exist instead of failing (without `force`). */
  reuseExisting?: boolean;
};

/** One table to scaffold. */
export interface Target {
  template: ModelTemplate;
  /** Model name, optionally nested: `admin/Product`. */
  model: string;
  table: string;
  /** Asked for (as opposed to pulled in by a foreign key). */
  requested: boolean;
}

export interface ScaffoldResult {
  migrations: string[];
  /** Tables whose migration already existed. */
  reused: string[];
  models: string[];
}

const rel = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");
const isInteractive = (o: ScaffoldOptions) =>
  o.interactive === true && process.stdin.isTTY === true && process.stdout.isTTY === true;

async function inquirer() {
  return (await import("inquirer")).default;
}

/** Ask for a template: a domain, then one of its templates. */
async function pickTemplate(domains: Domain[]): Promise<ModelTemplate> {
  const prompt = await inquirer();
  const { domain } = await prompt.prompt([
    {
      type: "list",
      name: "domain",
      message: "Domain:",
      choices: domains.map((d) => ({ name: `${d.title} — ${d.description}`, value: d.name })),
    },
  ]);
  const { picked } = await prompt.prompt([
    {
      type: "list",
      name: "picked",
      message: "Template:",
      choices: findDomain(domains, domain).templates.map((t) => ({ name: `${t.name} — ${t.description}`, value: t })),
    },
  ]);
  return picked;
}

/**
 * Add the targets for the tables `targets` reference that neither exist nor
 * are already listed, recursively. Returns the tables nothing can create.
 */
function addDependencies(targets: Target[], domains: Domain[], existing: Set<string>): string[] {
  const unknown = new Set<string>();
  const queue = [...targets];
  while (queue.length) {
    const t = queue.shift()!;
    for (const table of dependencies(t.template)) {
      if (existing.has(table) || targets.some((x) => x.table === table)) continue;
      const dep = templateForTable(domains, table, t.template.domain);
      if (!dep) {
        unknown.add(table);
        continue;
      }
      const target: Target = { template: dep, model: pascalCase(dep.name), table, requested: false };
      targets.push(target);
      queue.push(target);
    }
  }
  return [...unknown];
}

/**
 * `now`, or one second after the newest migration if that is later: an
 * earlier run may have numbered its migrations a few seconds ahead, and
 * migrations run in file-name order.
 */
export function firstFreeTimestamp(folder: string, now: Date): Date {
  const stamps = fs.existsSync(folder)
    ? fs.readdirSync(folder).flatMap((f) => f.match(/^(\d{14})_/)?.[1] ?? [])
    : [];
  const latest = stamps.sort().pop();
  if (!latest) return now;
  const [y, mo, d, h, mi, s] = [0, 4, 6, 8, 10, 12].map((i, k) => Number(latest.slice(i, k === 0 ? 4 : i + 2)));
  const next = new Date(y, mo - 1, d, h, mi, s + 1);
  return next > now ? next : now;
}

/** Scaffold these tables (and their dependencies) in a project. */
export async function scaffold(projectRoot: string, requested: Target[], opts: ScaffoldOptions): Promise<ScaffoldResult> {
  const mode = opts.mode ?? "model";
  const domains = allDomains(projectRoot);
  const { migrations: migrationsDir } = databasePaths(projectRoot);
  const schema = readMigrationSchema(migrationsDir);
  const existing = new Set(schema.keys());

  let targets = [...requested];
  if (opts.deps !== false) {
    const withDeps = [...targets];
    const unknown = addDependencies(withDeps, domains, existing);
    const extra = withDeps.filter((t) => !t.requested);
    let include = true;
    if (extra.length && isInteractive(opts)) {
      ({ include } = await (await inquirer()).prompt([
        {
          type: "confirm",
          name: "include",
          message: `Foreign keys point to tables no migration creates yet: ${extra.map((t) => t.table).join(", ")}. Create them too?`,
          default: true,
        },
      ]));
    }
    if (include) targets = withDeps;
    for (const table of unknown) {
      log.warn(`No template or migration creates "${table}", which a foreign key points to. Create it before migrating.`);
    }
  }
  targets = orderByDependencies(targets);

  // Check the requested files before writing anything.
  if (!opts.force && mode !== "migration") {
    const taken = (t: Target) => {
      if (t.template.pivot) return [];
      const files = generatedFiles(projectRoot, t.model);
      const list = mode === "resource" ? [files.dto, files.service, files.controller] : [files.model];
      if (opts.factory) list.push(files.factory);
      return list.filter((f) => fs.existsSync(f));
    };
    if (opts.reuseExisting) {
      // Already scaffolded (e.g. products, by another domain): keep what is there.
      for (const t of targets) {
        if (t.requested && taken(t).length) {
          t.requested = false;
          log.info(`  ${t.model} is already scaffolded; keeping its files (use --force to regenerate).`);
        }
      }
    } else {
      const files = requested.flatMap(taken);
      if (files.length) {
        throw new CliError(`Already exists: ${files.map((f) => rel(projectRoot, f)).join(", ")}. Use -f or --force to overwrite.`);
      }
    }
  }

  // SQL Server allows one cascade path between two tables, and none back to the same table.
  const dialect = projectDialect(projectRoot);
  let sqlServerFields: Map<string, FieldDef[]> | undefined;
  if (dialect === "mssql") {
    const writing = targets.filter((t) => !schema.has(t.table));
    const limited = limitCascadePaths(
      cascadeEdges(schema),
      writing.map((t) => ({ table: t.table, fields: t.template.fields })),
    );
    sqlServerFields = limited.fields;
    for (const d of limited.dropped) {
      log.info(`  SQL Server: ${d.table}.${d.column} gets no ON DELETE action (${d.reason}).`);
    }
  }

  const result: ScaffoldResult = { migrations: [], reused: [], models: [] };
  const start = firstFreeTimestamp(migrationsDir, opts.now ?? new Date());
  let offset = 0;
  for (const t of targets) {
    const table = schema.get(t.table);
    if (table) {
      result.reused.push(t.table);
      log.info(`  "${t.table}" is already created in ${table.createdIn}; keeping that migration.`);
      continue;
    }
    // One second apart, so they run in dependency order.
    const stamp = migrationTimestamp(new Date(start.getTime() + offset++ * 1000));
    const file = path.join(migrationsDir, `${stamp}_create_${t.table}_table.ts`);
    const template = { ...t.template, fields: sqlServerFields?.get(t.table) ?? t.template.fields };
    writeFileSafe(file, renderCreateMigration(template, t.table, dialect));
    log.success(`Migration created: ${rel(projectRoot, file)}`);
    result.migrations.push(file);
  }

  if (mode === "migration") return result;
  const cwd = projectRoot;
  for (const t of targets) {
    if (t.template.pivot) continue;
    const files = generatedFiles(projectRoot, t.model);
    if (t.requested && mode === "resource") {
      makeResource(t.model, { cwd, table: t.table, force: opts.force });
      result.models.push(files.model);
    } else if (!fs.existsSync(files.model) || (t.requested && opts.force)) {
      makeModel(t.model, { cwd, table: t.table, force: opts.force && t.requested });
      result.models.push(files.model);
    } else if (!t.requested) {
      log.info(`  Model exists, reusing: ${rel(projectRoot, files.model)}`);
    }
    if (opts.factory && (!fs.existsSync(files.factory) || (t.requested && opts.force))) {
      makeFactory(t.model, { cwd, force: opts.force && t.requested });
    }
  }
  if (result.migrations.length) log.info("  Create the tables with: megh migrate");
  return result;
}

export type MakeFromTemplateOptions = ScaffoldOptions & {
  /** `ecommerce/product`, `product`, or `true` to pick one. */
  template?: string | boolean;
  /** Columns added to (or replacing) the template's, or making up the table without a template. */
  fields?: FieldDef[];
  table?: string;
};

/**
 * `make:model Product --template ecommerce/product` (and `make:resource`):
 * a migration from the template, then the model (or resource) from it.
 * `--fields` alone describes the table without a template.
 */
export async function makeFromTemplate(name: string, opts: MakeFromTemplateOptions): Promise<ScaffoldResult> {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const domains = allDomains(projectRoot);
  const n = resolveName(name, "Model");
  const snake = snakeCase(n.base);

  let base: ModelTemplate;
  if (opts.template === true) {
    if (!isInteractive(opts)) {
      throw new CliError("Name the template, e.g. --template ecommerce/product (list them with megh template:list).");
    }
    base = await pickTemplate(domains);
  } else if (typeof opts.template === "string") {
    base = findTemplate(domains, opts.template);
  } else {
    if (!opts.fields?.length) throw new CliError("Pass --template <name> or --fields <list>.");
    base = {
      domain: "custom",
      name: snake,
      table: pluralize(snake),
      description: "",
      fields: [],
      timestamps: true,
      softDeletes: false,
      pivot: false,
      unique: [],
    };
  }
  const template: ModelTemplate = { ...base, fields: mergeFields(base.fields, opts.fields ?? []) };
  const table = opts.table ?? (snake === base.name ? base.table : pluralize(snake));
  if (template.pivot && opts.mode !== "migration") {
    log.info(`  ${base.domain}/${base.name} is a join table: writing its migration only (no model).`);
  }

  const created = readMigrationSchema(databasePaths(projectRoot).migrations).get(table);
  if (created && (opts.fields?.length || opts.template)) {
    log.warn(
      `"${table}" is already created in ${created.createdIn}, so the template's columns are not applied. ` +
        `Change the table with an alter-table migration: megh make:migration add_columns_to_${table}_table`,
    );
  }
  return scaffold(projectRoot, [{ template, model: [...n.dirs, n.base].join("/"), table, requested: true }], opts);
}

export type ScaffoldDomainOptions = ScaffoldOptions & {
  /** Templates to scaffold; default: all of the domain's (or a picked list). */
  only?: string[];
  /** Skip the checklist and take every template. */
  all?: boolean;
};

/** `scaffold:domain ecommerce`: several templates of a domain at once. */
export async function scaffoldDomain(domainName: string | undefined, opts: ScaffoldDomainOptions = {}): Promise<ScaffoldResult> {
  const projectRoot = requireProjectRoot(opts.cwd ?? process.cwd());
  const domains = allDomains(projectRoot);
  const interactive = isInteractive(opts);

  let domain: Domain;
  if (domainName) domain = findDomain(domains, domainName);
  else if (interactive) {
    const { picked } = await (await inquirer()).prompt([
      {
        type: "list",
        name: "picked",
        message: "Domain:",
        choices: domains.map((d) => ({ name: `${d.title} — ${d.description}`, value: d.name })),
      },
    ]);
    domain = findDomain(domains, picked);
  } else {
    throw new CliError(`Name a domain: ${domains.map((d) => d.name).join(", ")}.`);
  }

  let templates: ModelTemplate[];
  if (opts.only?.length) templates = opts.only.map((ref) => findTemplate([domain], ref));
  else if (interactive && !opts.all) {
    ({ templates } = await (await inquirer()).prompt([
      {
        type: "checkbox",
        name: "templates",
        message: `${domain.title} templates:`,
        choices: domain.templates.map((t) => ({ name: `${t.name} — ${t.description}`, value: t, checked: true })),
      },
    ]));
    if (!templates.length) throw new CliError("No templates selected.");
  } else templates = domain.templates;

  return scaffold(
    projectRoot,
    templates.map((t) => ({ template: t, model: pascalCase(t.name), table: t.table, requested: true })),
    { reuseExisting: true, ...opts },
  );
}

/** `template:list`: the domains and their templates. */
export function listTemplates(opts: { cwd?: string; domain?: string; json?: boolean } = {}): void {
  const cwd = opts.cwd ?? process.cwd();
  let projectRoot: string | undefined;
  try {
    projectRoot = requireProjectRoot(cwd);
  } catch {
    projectRoot = undefined;
  }
  const domains = allDomains(projectRoot);
  const shown = opts.domain ? [findDomain(domains, opts.domain)] : domains;
  if (opts.json) {
    console.log(JSON.stringify(shown, null, 2));
    return;
  }
  for (const d of shown) {
    console.log(`\n${d.title} (${d.name}) — ${d.description}`);
    const width = Math.max(...d.templates.map((t) => t.name.length));
    for (const t of d.templates) {
      const columns = t.fields.map((f) => f.name).join(", ");
      console.log(`  ${t.name.padEnd(width)}  ${t.description}${t.pivot ? " (join table)" : ""}`);
      if (opts.domain) console.log(`  ${" ".repeat(width)}  ${columns}`);
    }
  }
  console.log(
    "\nUse one: megh make:model Product --template ecommerce/product (or make:resource),\n" +
      "or a whole domain: megh scaffold:domain ecommerce. Add your own in .megh/templates/<domain>.json.",
  );
}
