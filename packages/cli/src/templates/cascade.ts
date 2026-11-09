import type { MigrationTable } from "../generators/migration-schema";
import type { FieldDef } from "./fields";

/**
 * SQL Server refuses a foreign key whose ON DELETE action (CASCADE or SET
 * NULL) would form a cycle (a table referencing itself counts) or a second
 * cascade path between two tables:
 *
 *   "Introducing FOREIGN KEY constraint ... may cause cycles or multiple
 *    cascade paths."
 *
 * Such a foreign key gets no ON DELETE action instead, so deleting the
 * referenced row fails while rows still point to it.
 */

/** A foreign key with a cascading action: deleting in `from` changes `to`. */
export interface CascadeEdge {
  from: string;
  to: string;
}

const CASCADING = new Set(["cascade", "set null", "set default"]);

/** The cascading foreign keys of the tables the migrations leave. */
export function cascadeEdges(schema: Map<string, MigrationTable>): CascadeEdge[] {
  const edges: CascadeEdge[] = [];
  for (const table of schema.values()) {
    for (const column of table.columns) {
      const ref = column.references;
      if (ref?.onDelete && CASCADING.has(ref.onDelete)) edges.push({ from: ref.table, to: table.name });
    }
  }
  return edges;
}

export interface DroppedAction {
  table: string;
  column: string;
  reason: string;
}

/**
 * Walk the new tables' foreign keys (in the order given, ownership first:
 * CASCADE before SET NULL) and drop the action of each one SQL Server would
 * refuse. Returns the tables' fields, changed where needed.
 */
export function limitCascadePaths(
  existing: CascadeEdge[],
  tables: { table: string; fields: FieldDef[] }[],
): { fields: Map<string, FieldDef[]>; dropped: DroppedAction[] } {
  const graph = new Map<string, Set<string>>();
  const add = (e: CascadeEdge) => {
    if (!graph.has(e.from)) graph.set(e.from, new Set());
    graph.get(e.from)!.add(e.to);
  };
  existing.forEach(add);

  const walk = (start: string, next: (node: string) => Iterable<string>): Set<string> => {
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      for (const n of next(queue.shift()!)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return seen;
  };
  const descendants = (node: string) => walk(node, (n) => graph.get(n) ?? []);
  const ancestors = (node: string) =>
    walk(node, (n) => [...graph].filter(([, tos]) => tos.has(n)).map(([from]) => from));

  /** Why SQL Server would refuse `from → to`, or undefined. */
  const conflict = (from: string, to: string): string | undefined => {
    if (from === to) return "it references its own table";
    if (descendants(to).has(from)) return "it would form a cycle of cascading deletes";
    const below = descendants(to);
    for (const a of ancestors(from)) {
      for (const b of descendants(a)) {
        if (below.has(b)) return `"${a}" would reach "${b}" through two cascade paths`;
      }
    }
    return undefined;
  };

  const fields = new Map(tables.map(({ table, fields: list }) => [table, list.map((f) => ({ ...f }))]));
  // Every CASCADE (a row owned by its parent) is placed before any SET NULL
  // (a looser link), each in the order given.
  const candidates = tables
    .flatMap(({ table }) => fields.get(table)!.map((f, i) => ({ table, f, i })))
    .filter(({ f }) => f.references?.onDelete && CASCADING.has(f.references.onDelete));
  const order = candidates.map((c, n) => ({ ...c, n })).sort((x, y) => rank(x.f) - rank(y.f) || x.n - y.n);

  const dropped: DroppedAction[] = [];
  for (const { table, f, i } of order) {
    const from = f.references!.table;
    const reason = conflict(from, table);
    if (!reason) {
      add({ from, to: table });
      continue;
    }
    fields.get(table)![i] = {
      ...f,
      nullable: f.nullable || f.references!.onDelete === "set null",
      references: { table: from },
      comment: "no ON DELETE action: SQL Server allows one cascade path between tables",
    };
    dropped.push({ table, column: f.name, reason });
  }
  return { fields, dropped };
}

/** CASCADE (ownership) is kept before SET NULL. */
const rank = (f: FieldDef) => (f.references?.onDelete === "cascade" ? 0 : 1);
