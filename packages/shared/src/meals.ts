import { z } from 'zod';
import { dateStr } from './schemas.js';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', dessert: 'Dessert' };

export const MAX_RECIPES = 2000;
export const MAX_PLAN_PER_DAY = 30;
export const MAX_GROCERY = 600;

export const ingredient = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(100000).optional(),
  unit: z.string().trim().max(40).optional(),
  note: z.string().trim().max(120).optional(),
});
export type Ingredient = z.infer<typeof ingredient>;

export const recipeInput = z.object({
  name: z.string().trim().min(1).max(160),
  servings: z.number().int().min(1).max(500).optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  /** Where to open the recipe (Tandoor). Only works while you can reach it, so it is just a convenience link. */
  url: z.string().trim().max(300).optional(),
  tandoorId: z.number().int().positive().optional(),
  ingredients: z.array(ingredient).max(120).default([]),
});
export type RecipeInput = z.infer<typeof recipeInput>;

/** What `npm run tandoor:export` writes and the Recipes tab imports. */
export const recipeImport = z.object({
  version: z.literal(1),
  recipes: z.array(recipeInput.extend({ tandoorId: z.number().int().positive() })).max(MAX_RECIPES),
});

export interface Recipe extends RecipeInput {
  id: string;
  source: 'tandoor' | 'manual';
  updatedAt: string;
}
export type RecipeSummary = Omit<Recipe, 'ingredients'> & { ingredientCount: number };

export const planInput = z
  .object({
    date: dateStr,
    slot: z.enum(MEAL_SLOTS),
    recipeId: z.string().min(1).max(80).optional(),
    /** A meal that is not in the recipe library ("leftovers", "pizza night"). Required when there is no recipeId. */
    title: z.string().trim().min(1).max(160).optional(),
  })
  .refine((v) => v.recipeId || v.title, { message: 'Pick a recipe or give the meal a name' });
export type PlanInput = z.infer<typeof planInput>;

/** A planned meal. Name and ingredients are copied in, so it keeps working if the recipe is later changed or removed. */
export interface PlanEntry {
  id: string;
  date: string;
  slot: MealSlot;
  title: string;
  recipeId?: string;
  servings?: number;
  url?: string;
  ingredients: Ingredient[];
  createdAt: string;
}

/** off = saved for later; need = on the list; got = in the cart. */
export const GROCERY_STATES = ['off', 'need', 'got'] as const;
export type GroceryState = (typeof GROCERY_STATES)[number];
export interface GroceryItem {
  id: string;
  name: string;
  state: GroceryState;
  /** Quantities from the recipes it was added for, e.g. "2 cups, 1 lb". */
  note?: string;
  updatedAt: string;
}

const groceryName = z.string().trim().min(1).max(80);
const groceryNote = z.string().trim().max(120);
export const groceryAdd = z.object({
  items: z.array(z.object({ name: groceryName, note: groceryNote.optional() })).min(1).max(120),
});
export const groceryPatch = z.object({
  state: z.enum(GROCERY_STATES).optional(),
  name: groceryName.optional(),
  note: groceryNote.optional(),
});

/** Same words, same item: "Cherry Tomatoes " and "cherry  tomatoes" are one saved item. */
export const normalizeItem = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
export const itemId = (name: string) => normalizeItem(name).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'item';

const FRACTIONS: [number, string][] = [[0.25, '¼'], [0.333, '⅓'], [0.5, '½'], [0.667, '⅔'], [0.75, '¾']];
/** 1.5 -> "1½", 0.333 -> "⅓", 2 -> "2". */
export const formatAmount = (n: number) => {
  const whole = Math.floor(n + 0.02);
  const frac = n - whole;
  if (Math.abs(frac) < 0.02) return String(whole);
  const f = FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.03);
  if (f) return (whole ? String(whole) : '') + f[1];
  return String(Math.round(n * 100) / 100);
};
/** "2 cups" / "1½" / "" - the quantity part of an ingredient line. */
export const quantityOf = (i: Ingredient) => [i.amount ? formatAmount(i.amount) : '', i.unit ?? ''].filter(Boolean).join(' ');

/** Which slots a recipe's Tandoor keywords hint at ("Breakfast", "Desserts"...). Used to put likely recipes first. */
export const slotsFromKeywords = (keywords: string[]): MealSlot[] => {
  const k = keywords.map((w) => w.toLowerCase());
  return MEAL_SLOTS.filter((s) => k.some((w) => w === s || w === s + 's' || w.includes(s)));
};
