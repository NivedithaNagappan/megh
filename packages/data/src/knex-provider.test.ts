import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { MeghContainer as Container } from "@meghjs/core";
import type { Knex } from "knex";
import { KnexDB, MEGH_KNEX_DB } from "./knex-provider";

describe("KnexDB", () => {
  beforeEach(() => {
    Container.reset();
  });

  it("throws if resolved before useKnex() has registered a connection", () => {
    expect(() => new KnexDB()).toThrow(
      "Knex is not initialized. Call useKnex first.",
    );
  });

  it("exposes the connection registered under MEGH_KNEX_DB", () => {
    const conn = { mock: "knexInstance" } as unknown as Knex;
    Container.set(MEGH_KNEX_DB, conn);

    const db = new KnexDB();

    expect(db.client).toBe(conn);
  });

  it("resolves through the DI container", () => {
    const conn = { mock: "knexInstance" } as unknown as Knex;
    Container.set(MEGH_KNEX_DB, conn);

    const db = Container.get(KnexDB);

    expect(db.client).toBe(conn);
  });
});
