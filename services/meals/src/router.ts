import { randomUUID } from 'node:crypto';
import {
  HttpError,
  MAX_GROCERY,
  MAX_PLAN_PER_DAY,
  MEAL_SLOTS,
  addDays,
  createRouter,
  dateStr,
  groceryAdd,
  groceryPatch,
  itemId,
  parse,
  planInput,
  recipeImport,
  recipeInput,
  type Db,
  type GroceryItem,
  type PlanEntry,
  type Recipe,
  type RecipeSummary,
  type Route,
} from '@gravity/shared/server';

export const MEALS_PREFIX = '/api/meals';

export interface MealsDeps {
  db: Db;
  table: string;
  allowlist: () => Promise<string[]>;
  now?: () => Date;
}

const RECIPES = 'RECIPE';
const GROCERY = 'GROCERY';
const planPk = (date: string) => 'PLAN#' + date.slice(0, 7);
const MAX_RANGE_DAYS = 62;

const strip = <T>(it: Record<string, unknown>): T => {
  const { pk: _pk, sk: _sk, ...rest } = it;
  return rest as T;
};
const summary = ({ ingredients, ...rest }: Recipe): RecipeSummary => ({ ...rest, ingredientCount: ingredients.length });

/** "2 cups" + "1 lb" -> "2 cups, 1 lb", without repeating a quantity or growing past the note limit. */
const mergeNotes = (a: string | undefined, b: string | undefined) => {
  const parts = (a ?? '').split(', ').filter(Boolean);
  if (b && !parts.includes(b)) parts.push(b);
  return parts.join(', ').slice(0, 120);
};

export function buildMealsRouter({ db, table, allowlist, now = () => new Date() }: MealsDeps) {
  const stamp = () => now().toISOString();
  const loadRecipe = async (id: string) => {
    const it = await db.get(table, RECIPES, 'R#' + id);
    if (!it) throw new HttpError(404, 'Recipe not found');
    return strip<Recipe>(it);
  };
  const inChunks = async <T>(items: T[], fn: (x: T) => Promise<void>, size = 25) => {
    for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
  };

  const routes: Route[] = [
    // ---- Recipe library -----------------------------------------------------------------------------------------
    { method: 'GET', path: '/recipes', handler: async () => (await db.query(table, RECIPES, 'R#')).map((it) => summary(strip<Recipe>(it))).sort((a, b) => a.name.localeCompare(b.name)) },
    { method: 'GET', path: '/recipes/:id', handler: async ({ params }) => loadRecipe(params.id!) },
    {
      method: 'POST',
      path: '/recipes',
      handler: async ({ body }) => {
        const input = parse(recipeInput, body);
        const r: Recipe = { ...input, id: 'm-' + randomUUID(), source: 'manual', updatedAt: stamp() };
        await db.put(table, { pk: RECIPES, sk: 'R#' + r.id, ...r });
        return { status: 201, body: r };
      },
    },
    {
      method: 'DELETE',
      path: '/recipes/:id',
      handler: async ({ params }) => {
        const r = await loadRecipe(params.id!);
        // Tandoor recipes belong to Tandoor: they would reappear on the next import, so removing one here would only confuse.
        if (r.source === 'tandoor') throw new HttpError(400, 'Remove this recipe in Tandoor, then import again');
        await db.delete(table, RECIPES, 'R#' + r.id);
        return { status: 204 };
      },
    },
    {
      // Replaces the Tandoor part of the library with the file; recipes added by hand are left alone.
      method: 'POST',
      path: '/recipes/import',
      handler: async ({ body }) => {
        const file = parse(recipeImport, body);
        const at = stamp();
        const incoming = new Map(file.recipes.map((r) => [`t${r.tandoorId}`, r]));
        const existing = (await db.query(table, RECIPES, 'R#')).map((it) => strip<Recipe>(it));
        const stale = existing.filter((r) => r.source === 'tandoor' && !incoming.has(r.id));
        await inChunks([...incoming.entries()], async ([id, r]) => {
          const rec: Recipe = { ...r, id, source: 'tandoor', updatedAt: at };
          await db.put(table, { pk: RECIPES, sk: 'R#' + id, ...rec });
        });
        await inChunks(stale, (r) => db.delete(table, RECIPES, 'R#' + r.id));
        return { imported: incoming.size, removed: stale.length };
      },
    },

    // ---- Plan ---------------------------------------------------------------------------------------------------
    {
      method: 'GET',
      path: '/plan',
      handler: async ({ query }) => {
        const from = parse(dateStr, query.from);
        const to = parse(dateStr, query.to);
        if (to < from || addDays(from, MAX_RANGE_DAYS) < to) throw new HttpError(400, 'Ask for at most two months at a time');
        const months = new Set<string>();
        for (let d = from; d <= to; d = addDays(d, 20)) months.add(d.slice(0, 7));
        months.add(to.slice(0, 7));
        const out: PlanEntry[] = [];
        for (const m of months) for (const it of await db.query(table, 'PLAN#' + m)) out.push(strip<PlanEntry>(it));
        return out
          .filter((e) => e.date >= from && e.date <= to)
          .sort((a, b) => a.date.localeCompare(b.date) || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot) || a.createdAt.localeCompare(b.createdAt));
      },
    },
    {
      method: 'POST',
      path: '/plan',
      handler: async ({ body }) => {
        const input = parse(planInput, body);
        if ((await db.query(table, planPk(input.date), input.date + '#')).length >= MAX_PLAN_PER_DAY) throw new HttpError(400, 'That day is full');
        const recipe = input.recipeId ? await loadRecipe(input.recipeId) : undefined;
        const entry: PlanEntry = {
          id: randomUUID(),
          date: input.date,
          slot: input.slot,
          title: recipe?.name ?? input.title!,
          ...(recipe ? { recipeId: recipe.id, ...(recipe.servings ? { servings: recipe.servings } : {}), ...(recipe.url ? { url: recipe.url } : {}) } : {}),
          ingredients: recipe?.ingredients ?? [],
          createdAt: stamp(),
        };
        await db.put(table, { pk: planPk(entry.date), sk: entry.date + '#' + entry.id, ...entry });
        return { status: 201, body: entry };
      },
    },
    {
      method: 'DELETE',
      path: '/plan/:date/:id',
      handler: async ({ params }) => {
        const date = parse(dateStr, params.date);
        await db.delete(table, planPk(date), date + '#' + params.id!);
        return { status: 204 };
      },
    },

    // ---- Grocery list -------------------------------------------------------------------------------------------
    { method: 'GET', path: '/grocery', handler: async () => (await db.query(table, GROCERY, 'ITEM#')).map((it) => strip<GroceryItem>(it)).sort((a, b) => a.name.localeCompare(b.name)) },
    {
      // Used both by typing a new item and by "add the ingredients I ticked": existing items are put back on the list.
      method: 'POST',
      path: '/grocery/add',
      handler: async ({ body }) => {
        const { items } = parse(groceryAdd, body);
        let count = (await db.query(table, GROCERY, 'ITEM#')).length;
        const out: GroceryItem[] = [];
        for (const { name, note } of items) {
          const id = itemId(name);
          const prev = (await db.get(table, GROCERY, 'ITEM#' + id)) as (GroceryItem & { pk: string; sk: string }) | undefined;
          if (!prev) {
            if (count >= MAX_GROCERY) throw new HttpError(400, 'The grocery list is full. Remove some saved items first');
            count++;
          }
          // Already on the list: stack the quantities. Saved or in the cart: start fresh.
          const merged = prev?.state === 'need' ? mergeNotes(prev.note, note) : note;
          const item: GroceryItem = { id, name: prev?.name ?? name, state: 'need', ...(merged ? { note: merged } : {}), updatedAt: stamp() };
          await db.put(table, { pk: GROCERY, sk: 'ITEM#' + id, ...item });
          out.push(item);
        }
        return out;
      },
    },
    {
      method: 'PATCH',
      path: '/grocery/:id',
      handler: async ({ params, body }) => {
        const patch = parse(groceryPatch, body);
        const prev = await db.get(table, GROCERY, 'ITEM#' + params.id!);
        if (!prev) throw new HttpError(404, 'Item not found');
        const cur = strip<GroceryItem>(prev);
        const state = patch.state ?? cur.state;
        // A saved item that is no longer needed forgets its old quantities.
        const note = state === 'off' ? undefined : patch.note !== undefined ? patch.note || undefined : cur.note;
        const next: GroceryItem = { id: cur.id, name: patch.name ?? cur.name, state, ...(note ? { note } : {}), updatedAt: stamp() };
        await db.put(table, { pk: GROCERY, sk: 'ITEM#' + cur.id, ...next });
        return next;
      },
    },
    {
      method: 'DELETE',
      path: '/grocery/:id',
      handler: async ({ params }) => {
        await db.delete(table, GROCERY, 'ITEM#' + params.id!);
        return { status: 204 };
      },
    },
    {
      // After the shop: everything in the cart goes back to "saved" so it is one tap away next week.
      method: 'POST',
      path: '/grocery/clear-done',
      handler: async () => {
        const got = (await db.query(table, GROCERY, 'ITEM#')).map((it) => strip<GroceryItem>(it)).filter((i) => i.state === 'got');
        await inChunks(got, async (i) => {
          const { note: _note, ...rest } = i;
          await db.put(table, { pk: GROCERY, sk: 'ITEM#' + i.id, ...rest, state: 'off', updatedAt: stamp() });
        });
        return { cleared: got.length };
      },
    },
  ];

  return createRouter({ prefix: MEALS_PREFIX, routes, allowlist });
}
