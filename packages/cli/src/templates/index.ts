import fs from "fs";
import path from "path";
import { CliError } from "../errors";
import { common } from "./catalog/common";
import { construction } from "./catalog/construction";
import { crm } from "./catalog/crm";
import { ecommerce } from "./catalog/ecommerce";
import { education } from "./catalog/education";
import { hr } from "./catalog/hr";
import { logistics } from "./catalog/logistics";
import { marketing } from "./catalog/marketing";
import { medical } from "./catalog/medical";
import { pos } from "./catalog/pos";
import { realEstate } from "./catalog/real-estate";
import { dependencies, template, type Domain, type ModelTemplate, type TemplateOptions } from "./template";

export type { Domain, ModelTemplate } from "./template";
export { dependencies } from "./template";

/** The built-in domains, in the order they are listed. */
export const BUILTIN_DOMAINS: readonly Domain[] = [
  common,
  ecommerce,
  pos,
  medical,
  construction,
  marketing,
  realEstate,
  hr,
  crm,
  education,
  logistics,
];

/** Where a project keeps its own templates, one JSON file per domain. */
export const PROJECT_TEMPLATES_DIR = path.join(".megh", "templates");

type TemplateFile = {
  domain?: string;
  title?: string;
  description?: string;
  templates?: ({ name: string; description?: string; fields: string[] } & TemplateOptions)[];
};

/** Domains from `.megh/templates/*.json` in the project. */
export function readProjectDomains(projectRoot: string): Domain[] {
  const dir = path.join(projectRoot, PROJECT_TEMPLATES_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const rel = path.join(PROJECT_TEMPLATES_DIR, file).split(path.sep).join("/");
      let data: TemplateFile;
      try {
        data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      } catch (err) {
        throw new CliError(`${rel} is not valid JSON: ${(err as Error).message}`);
      }
      const name = data.domain ?? file.replace(/\.json$/, "");
      if (!Array.isArray(data.templates)) {
        throw new CliError(`${rel} needs a "templates" array: [{ "name": "ticket", "fields": ["title", "status:in(open|closed)"] }]`);
      }
      const templates = data.templates.map((t, i) => {
        if (!t || typeof t.name !== "string" || !Array.isArray(t.fields)) {
          throw new CliError(`${rel}: templates[${i}] needs a "name" and a "fields" array.`);
        }
        try {
          return template(name, t.name, t.description ?? "", t.fields, t);
        } catch (err) {
          throw new CliError(`${rel} (${t.name}): ${(err as Error).message}`);
        }
      });
      return { name, title: data.title ?? name, description: data.description ?? "", templates };
    });
}

/** Built-in domains merged with the project's: a project template replaces a built-in one of the same name. */
export function allDomains(projectRoot?: string): Domain[] {
  const domains = BUILTIN_DOMAINS.map((d) => ({ ...d, templates: [...d.templates] }));
  for (const own of projectRoot ? readProjectDomains(projectRoot) : []) {
    const existing = domains.find((d) => d.name === own.name);
    if (!existing) {
      domains.push(own);
      continue;
    }
    for (const t of own.templates) {
      const i = existing.templates.findIndex((x) => x.name === t.name);
      if (i === -1) existing.templates.push(t);
      else existing.templates[i] = t;
    }
  }
  return domains;
}

export function findDomain(domains: Domain[], name: string): Domain {
  const domain = domains.find((d) => d.name === name);
  if (!domain) {
    throw new CliError(`Unknown domain "${name}". Choose from: ${domains.map((d) => d.name).join(", ")}.`);
  }
  return domain;
}

/**
 * The template for `ecommerce/product`, or for a bare `product` when only
 * one domain has it (a common template wins over the others).
 */
export function findTemplate(domains: Domain[], ref: string): ModelTemplate {
  const [domainName, name] = ref.includes("/") ? ref.split("/", 2) : [undefined, ref];
  const key = name.replace(/-/g, "_");
  if (domainName) {
    const domain = findDomain(domains, domainName);
    const found = domain.templates.find((t) => t.name === key);
    if (!found) {
      throw new CliError(
        `The ${domain.name} domain has no "${name}" template. It has: ${domain.templates.map((t) => t.name).join(", ")}.`,
      );
    }
    return found;
  }
  const matches = domains.flatMap((d) => d.templates.filter((t) => t.name === key));
  if (matches.length === 0) {
    throw new CliError(`No template is named "${name}". List them with: megh template:list`);
  }
  if (matches.length > 1) {
    const commonMatch = matches.find((t) => t.domain === "common");
    if (commonMatch) return commonMatch;
    throw new CliError(
      `"${name}" is in several domains: ${matches.map((t) => `${t.domain}/${t.name}`).join(", ")}. Pick one.`,
    );
  }
  return matches[0];
}

/** The template that creates `table`: from `domain` first, then common, then any other domain. */
export function templateForTable(domains: Domain[], table: string, domain?: string): ModelTemplate | undefined {
  const order = [
    ...domains.filter((d) => d.name === domain),
    ...domains.filter((d) => d.name === "common" && d.name !== domain),
    ...domains.filter((d) => d.name !== domain && d.name !== "common"),
  ];
  for (const d of order) {
    const found = d.templates.find((t) => t.table === table);
    if (found) return found;
  }
  return undefined;
}

/**
 * Order `templates` so each comes after the tables its foreign keys point
 * to (when those are in the list too). Throws on a cycle.
 */
export function orderByDependencies<T extends { template: ModelTemplate; table: string }>(items: T[]): T[] {
  const byTable = new Map(items.map((i) => [i.table, i]));
  const out: T[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (item: T, trail: string[]) => {
    const s = state.get(item.table);
    if (s === "done") return;
    if (s === "visiting") throw new CliError(`Foreign keys form a cycle: ${[...trail, item.table].join(" → ")}.`);
    state.set(item.table, "visiting");
    for (const dep of dependencies(item.template)) {
      const target = byTable.get(dep);
      if (target && target !== item) visit(target, [...trail, item.table]);
    }
    state.set(item.table, "done");
    out.push(item);
  };
  for (const item of items) visit(item, []);
  return out;
}
