import {
  PLANNER_HOUSEHOLD as HH,
  plannerHouseholdPk,
  plannerItemSk,
  plannerSettingsSk,
  plannerYearPk,
  type Db,
  type Item,
  type PlannerRow,
} from '@gravity/shared/server';

export type Doc = Record<string, unknown>;

/** Port of store.py's DynamoStore on the Db interface. The Db has no batch write, so year-wide writes loop (fine at this size). */
export function plannerStore(db: Db, table: string, now: () => Date) {
  const put = (pk: string, sk: string, doc: Doc, user: string) => {
    const row: Omit<PlannerRow, 'pk' | 'sk'> = { doc, updatedBy: user, updatedAt: Math.floor(now().getTime() / 1000) };
    return db.put(table, { pk, sk, ...row });
  };
  const docOf = (it: Item | undefined) => (it ? (it.doc as Doc) : null);
  const hh = plannerHouseholdPk(HH);

  const clearItems = async (year: number) => {
    for (const row of await db.query(table, plannerYearPk(year, HH))) await db.delete(table, row.pk, row.sk);
  };

  return {
    async listYears() {
      const rows = await db.query(table, hh, 'Y#');
      return rows
        .map((r) => ({ year: Number(r.sk.slice(2)), settings: r.doc as Doc }))
        .sort((a, b) => a.year - b.year);
    },
    getSettings: async (year: number) => docOf(await db.get(table, hh, plannerSettingsSk(year))),
    putSettings: (year: number, doc: Doc, user: string) => put(hh, plannerSettingsSk(year), doc, user),

    async listItems(year: number) {
      const out: Record<string, Doc[]> = {};
      for (const row of await db.query(table, plannerYearPk(year, HH), 'I#')) {
        const collection = row.sk.split('#')[1]!;
        (out[collection] ??= []).push(row.doc as Doc);
      }
      return out;
    },
    getItem: async (year: number, collection: string, id: string) => docOf(await db.get(table, plannerYearPk(year, HH), plannerItemSk(collection, id))),
    putItem: (year: number, collection: string, id: string, doc: Doc, user: string) => put(plannerYearPk(year, HH), plannerItemSk(collection, id), doc, user),
    deleteItem: (year: number, collection: string, id: string) => db.delete(table, plannerYearPk(year, HH), plannerItemSk(collection, id)),

    async deleteYear(year: number) {
      await clearItems(year);
      await db.delete(table, hh, plannerSettingsSk(year));
    },
    /** Writes the new rows first, then deletes only old items that are not in the new set, so a failure part-way loses nothing. */
    async replaceYear(year: number, settings: Doc, collections: Record<string, Doc[]>, user: string) {
      const pk = plannerYearPk(year, HH);
      const keep = new Set<string>();
      for (const [collection, items] of Object.entries(collections)) {
        for (const doc of items) {
          const sk = plannerItemSk(collection, String(doc.id));
          keep.add(sk);
          await put(pk, sk, doc, user);
        }
      }
      await put(hh, plannerSettingsSk(year), settings, user);
      for (const row of await db.query(table, pk)) if (!keep.has(row.sk)) await db.delete(table, row.pk, row.sk);
    },
  };
}
export type PlannerStore = ReturnType<typeof plannerStore>;
