import { pluralize } from "../generators/orm-model";
import { parseFieldSpec, type FieldDef } from "./fields";

/** A table a model is scaffolded from: its columns, timestamps and keys. */
export interface ModelTemplate {
  /** e.g. `ecommerce`. */
  domain: string;
  /** snake_case singular, e.g. `order_item`. */
  name: string;
  /** e.g. `order_items`. */
  table: string;
  description: string;
  fields: FieldDef[];
  timestamps: boolean;
  softDeletes: boolean;
  /** A join table: no id, a composite primary key, migration only (no model). */
  pivot: boolean;
  /** Composite unique keys. */
  unique: string[][];
}

export interface Domain {
  name: string;
  title: string;
  description: string;
  templates: ModelTemplate[];
}

export type TemplateOptions = {
  table?: string;
  timestamps?: boolean;
  softDeletes?: boolean;
  pivot?: boolean;
  unique?: string[][];
};

/** A template from field specs (see fields.ts). */
export function template(
  domain: string,
  name: string,
  description: string,
  specs: string[],
  opts: TemplateOptions = {},
): ModelTemplate {
  const pivot = opts.pivot === true;
  return {
    domain,
    name,
    table: opts.table ?? pluralize(name),
    description,
    fields: specs.flatMap(parseFieldSpec),
    timestamps: opts.timestamps ?? !pivot,
    softDeletes: opts.softDeletes ?? false,
    pivot,
    unique: opts.unique ?? [],
  };
}

/** A domain whose templates are written as `[name, description, specs, options?]`. */
export function domain(
  name: string,
  title: string,
  description: string,
  templates: [string, string, string[], TemplateOptions?][],
): Domain {
  return {
    name,
    title,
    description,
    templates: templates.map(([n, d, specs, opts]) => template(name, n, d, specs, opts)),
  };
}

/** Tables a template's foreign keys point to (itself excluded). */
export function dependencies(t: ModelTemplate): string[] {
  const tables = t.fields.flatMap((f) => (f.references ? [f.references.table] : []));
  return [...new Set(tables)].filter((table) => table !== t.table);
}
