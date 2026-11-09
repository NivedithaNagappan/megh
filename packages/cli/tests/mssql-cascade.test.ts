import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runCli } from "../src/program";
import { parseFieldList } from "../src/templates/fields";
import { cascadeEdges, limitCascadePaths } from "../src/templates/cascade";
import { readMigrationSchema } from "../src/generators/migration-schema";
import { projectDialect } from "../src/utils/dialect";

describe("limitCascadePaths", () => {
  const table = (name: string, fields: string) => ({ table: name, fields: parseFieldList(fields) });
  const action = (fields: Map<string, any[]>, t: string, column: string) =>
    fields.get(t)!.find((f) => f.name === column).references.onDelete;

  it("drops the action of a self-reference, keeping it nullable", () => {
    const { fields, dropped } = limitCascadePaths([], [table("categories", "name,parent_id:foreign(categories):nullOnDelete")]);
    const parent = fields.get("categories")!.find((f) => f.name === "parent_id")!;
    expect(parent.references).toEqual({ table: "categories" });
    expect(parent.nullable).toBe(true);
    expect(dropped).toEqual([{ table: "categories", column: "parent_id", reason: "it references its own table" }]);
  });

  it("keeps one cascade path between two tables, preferring CASCADE", () => {
    const { fields, dropped } = limitCascadePaths(
      [{ from: "users", to: "projects" }],
      [table("tasks", "assignee_id:foreign(users):nullOnDelete,project_id:cascade")],
    );
    // users → projects → tasks is a path, so users → tasks would be a second one.
    expect(action(fields, "tasks", "project_id")).toBe("cascade");
    expect(action(fields, "tasks", "assignee_id")).toBeUndefined();
    expect(dropped[0]).toMatchObject({ column: "assignee_id", reason: expect.stringMatching(/two cascade paths/) });
  });

  it("drops a second foreign key between the same two tables", () => {
    const { dropped } = limitCascadePaths([], [table("transfers", "from_id:foreign(accounts):cascade,to_id:foreign(accounts):cascade")]);
    expect(dropped.map((d) => d.column)).toEqual(["to_id"]);
  });

  it("drops an action that would close a cycle", () => {
    const { dropped } = limitCascadePaths([{ from: "a", to: "b" }], [table("a", "b_id:foreign(b):cascade")]);
    expect(dropped[0].reason).toMatch(/cycle/);
  });

  it("leaves separate paths alone", () => {
    const { dropped } = limitCascadePaths([], [table("order_items", "order_id:cascade,product_id:nullOnDelete")]);
    expect(dropped).toEqual([]);
  });
});

describe("scaffolding for SQL Server", () => {
  let tmp: string;
  const run = (...args: string[]) => runCli(args, { cwd: tmp });
  const migrationDir = () => path.join(tmp, "src/database/migrations");
  const migration = (match: string) => {
    const file = fs.readdirSync(migrationDir()).find((f) => f.includes(match))!;
    return fs.readFileSync(path.join(migrationDir(), file), "utf8");
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "megh-mssql-"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x" }));
    fs.writeFileSync(path.join(tmp, ".env"), "DATABASE_URL=mssql://sa:pw@localhost:1433/app?trustServerCertificate=true\n");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reads the dialect like useMeghORM", () => {
    expect(projectDialect(tmp)).toBe("mssql");
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "x", megh: { database: { dialect: "postgres" } } }));
    expect(projectDialect(tmp)).toBe("postgres");
  });

  it("gives a self-reference no ON DELETE action", async () => {
    expect(await run("make:model", "Category", "--template", "category", "-y")).toBe(0);
    expect(migration("create_categories")).toContain(
      'table.foreignId("parent_id").nullable().constrained("categories"); // no ON DELETE action: SQL Server allows one cascade path between tables',
    );
  });

  it("writes RESTRICT as NO ACTION", async () => {
    expect(await run("make:model", "Sale", "--template", "pos/sale", "-y")).toBe(0);
    expect(migration("create_sales")).toContain('table.foreignId("outlet_id").constrained("outlets").onDelete("no action");');
  });

  it("leaves other databases as they were", async () => {
    fs.writeFileSync(path.join(tmp, ".env"), "DATABASE_URL=postgres://localhost/app\n");
    expect(await run("make:model", "Category", "--template", "category", "-y")).toBe(0);
    expect(migration("create_categories")).toContain('table.foreignId("parent_id").constrained("categories").nullOnDelete();');
  });

  it("scaffolds every domain with at most one cascade path between any two tables", async () => {
    for (const domain of ["common", "ecommerce", "pos", "medical", "construction", "marketing", "real-estate", "hr", "crm", "education", "logistics"]) {
      expect(await run("scaffold:domain", domain, "--migrations-only", "-y"), domain).toBe(0);
    }
    const schema = readMigrationSchema(migrationDir());
    const edges = cascadeEdges(schema);
    const graph = new Map<string, string[]>();
    for (const e of edges) graph.set(e.from, [...(graph.get(e.from) ?? []), e.to]);

    // Count the cascade paths from every table; a cycle or a second path is what SQL Server refuses.
    const problems: string[] = [];
    for (const start of graph.keys()) {
      const paths = new Map<string, number>();
      const visit = (node: string, trail: string[]) => {
        for (const next of graph.get(node) ?? []) {
          if (next === start || trail.includes(next)) problems.push(`cycle ${[...trail, next].join(" → ")}`);
          else {
            paths.set(next, (paths.get(next) ?? 0) + 1);
            visit(next, [...trail, next]);
          }
        }
      };
      visit(start, [start]);
      for (const [to, n] of paths) if (n > 1) problems.push(`${start} → ${to}: ${n} paths`);
    }
    expect(problems).toEqual([]);
    expect(edges.length).toBeGreaterThan(50); // most foreign keys keep their action
    for (const file of fs.readdirSync(migrationDir())) {
      expect(fs.readFileSync(path.join(migrationDir(), file), "utf8")).not.toContain('onDelete("restrict")');
    }
  });
});
