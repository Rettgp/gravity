/** Planner (Christmas + Birthday) constants, key layout and types. Pure: used by the service, the web app and the migration script. */

export const PLANNER_HOUSEHOLD = 'main';
export const PLANNER_MAX_ITEM_BYTES = 64 * 1024;
export const PLANNER_MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const PLANNER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const PLANNER_MIN_YEAR = 2000;
export const PLANNER_MAX_YEAR = 2100;

export const PLANNER_COLLECTIONS = [
  'todos', 'budget_categories', 'expenses', 'gifts', 'cards', 'decorations', 'shopping',
  'meals', 'groceries', 'recipes', 'traditions', 'bucket_list', 'trips', 'packing',
  'bday_budget_categories', 'bday_expenses', 'bday_gifts', 'bday_decorations', 'bday_yes_day',
] as const;
export type PlannerCollection = (typeof PLANNER_COLLECTIONS)[number];
export const PLANNER_GIFT_COLLECTIONS = ['gifts', 'bday_gifts'] as const;

// Feedback moved to the core service. Old rows lived at HH#main / F#<id> and are migrated by the migration script.

// Row keys, identical to the old christmas-planner table (attribute names are lowercased: pk, sk).
export const plannerHouseholdPk = (household = PLANNER_HOUSEHOLD) => `HH#${household}`;
export const plannerYearPk = (year: number, household = PLANNER_HOUSEHOLD) => `HH#${household}#Y#${year}`;
export const plannerSettingsSk = (year: number) => `Y#${year}`;
export const plannerItemSk = (collection: string, id: string) => `I#${collection}#${id}`;

/** A stored row: `doc` is a native object (the old table kept it as a JSON string). */
export interface PlannerRow {
  pk: string;
  sk: string;
  doc: Record<string, unknown>;
  updatedBy: string;
  /** Epoch seconds. */
  updatedAt: number;
}

export interface PriceTracker {
  pct: number;
  email: string;
  basePrice: number | null;
  lastPrice: number | null;
  /** Epoch ms. */
  checkedAt: number | null;
  notifiedAt: number | null;
  error: string | null;
}
