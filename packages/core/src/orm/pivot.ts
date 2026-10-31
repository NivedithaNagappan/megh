/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import { bindable, isSqlite } from "./casts";
import { getConnection, runInTransaction } from "./connection";
import { loadBelongsToMany } from "./query";
import type { RelationDefinition } from "./relations";
import type { ModelClass, Row } from "./types";

/** A related row's key, or the related model itself. */
export type RelatedRef = string | number | bigint | object;

/**
 * The pivot rows of one model's `belongsToMany` relation:
 * `await user.related("roles").attach([1, 2])`.
 */
export class PivotRelation<R, Pivot = {}> {
  constructor(
    private readonly parent: any,
    private readonly def: RelationDefinition,
  ) {}

  private get pivot() {
    return this.def.pivot!;
  }

  private parentKey(): unknown {
    const key = this.parent[this.def.localKey];
    if (key === null || key === undefined) {
      throw new Error(
        `[Avleon ORM] Save the ${this.parent.constructor.name} before changing its "${this.pivot.table}" pivot rows.`,
      );
    }
    return key;
  }

  private keyOf(ref: RelatedRef): unknown {
    return ref !== null && typeof ref === "object"
      ? (ref as any)[this.pivot.relatedKey]
      : ref;
  }

  private keysOf(refs: RelatedRef | readonly RelatedRef[]): unknown[] {
    return (Array.isArray(refs) ? refs : [refs]).map((r) => this.keyOf(r));
  }

  /** The related models, each with its `pivot` row. */
  async get(): Promise<(Row<R> & { readonly pivot: Pivot })[]> {
    const holder: any = { [this.def.localKey]: this.parentKey() };
    await loadBelongsToMany(
      this.def,
      this.def.related() as unknown as ModelClass,
      [holder],
      "related",
      [],
    );
    return holder.related;
  }

  /** Link related rows, optionally setting pivot columns on the new rows. */
  async attach(
    refs: RelatedRef | readonly RelatedRef[],
    attributes: Partial<Pivot> = {},
  ): Promise<void> {
    const keys = this.keysOf(refs);
    if (keys.length === 0) return;
    const db = getConnection();
    const sqlite = isSqlite(db);
    const parentKey = this.parentKey();
    const rows = keys.map((key) => {
      const row: Record<string, unknown> = {
        ...(attributes as Record<string, unknown>),
        [this.def.foreignKey]: parentKey,
        [this.pivot.relatedPivotKey]: key,
      };
      for (const [k, v] of Object.entries(row)) row[k] = bindable(v, sqlite);
      return row;
    });
    await db.insertInto(this.pivot.table).values(rows).execute();
  }

  /** Unlink the given related rows, or all of them. Returns the number unlinked. */
  async detach(refs?: RelatedRef | readonly RelatedRef[]): Promise<number> {
    let qb: any = getConnection()
      .deleteFrom(this.pivot.table)
      .where(this.def.foreignKey, "=", this.parentKey());
    if (refs !== undefined) {
      const keys = this.keysOf(refs);
      if (keys.length === 0) return 0;
      qb = qb.where(this.pivot.relatedPivotKey, "in", keys);
    }
    const result = await qb.executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }

  /**
   * Make the linked rows exactly `refs`: attach the missing ones, detach the
   * rest, in one transaction.
   */
  async sync(
    refs: readonly RelatedRef[],
  ): Promise<{ attached: unknown[]; detached: unknown[] }> {
    const wanted = this.keysOf(refs);
    return runInTransaction(async () => {
      const current: unknown[] = (
        await getConnection()
          .selectFrom(this.pivot.table)
          .select(this.pivot.relatedPivotKey)
          .where(this.def.foreignKey, "=", this.parentKey())
          .execute()
      ).map((r: any) => r[this.pivot.relatedPivotKey]);

      const has = (list: unknown[], key: unknown) =>
        list.some((k) => String(k) === String(key));
      const attached = wanted.filter((k) => !has(current, k));
      const detached = current.filter((k) => !has(wanted, k));
      if (detached.length > 0) await this.detach(detached as RelatedRef[]);
      if (attached.length > 0) await this.attach(attached as RelatedRef[]);
      return { attached, detached };
    });
  }
}
