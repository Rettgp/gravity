import { uid } from '../lib/format'
import type { CollectionName, Item, YearData } from './PlannerContext'

export const BUDGET_LINKS = [
  { value: 'gifts', label: 'Gift Planner (gift costs)' },
  { value: 'shopping', label: 'Shopping List (purchased items)' },
  { value: 'decorations', label: 'Decorations (bought items)' },
  { value: 'groceries', label: 'Grocery List (bought items)' },
]

export function seedCollections(year: number): YearData['collections'] {
  const d = (m: number, day: number) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const cats: [string, string?][] = [
    ['Gifts', 'gifts'],
    ['Food & Groceries', 'groceries'],
    ['Decorations', 'decorations'],
    ['Cards & Postage'],
    ['Holiday Shopping', 'shopping'],
    ['Travel'],
    ['Entertaining & Activities'],
    ['Other'],
  ]
  return {
    budget_categories: cats.map(([name, link], i) => ({ id: uid(), name, planned: '', link: link ?? '', order: i })),
    bucket_list: [
      'Drive around to see the Christmas lights',
      'Bake and decorate Christmas cookies',
      'Watch a favourite Christmas movie in pajamas',
      'Make hot chocolate with all the toppings',
      'Visit a Christmas market',
      'Build a gingerbread house',
      'Do a random act of kindness',
      'Read a Christmas story by the fire',
    ].map((title) => ({ id: uid(), title, done: false })),
    todos: [
      ['Set the Christmas budget', d(11, 1), 'Planning'],
      ['Write the gift list', d(11, 8), 'Gifts'],
      ['Order Christmas cards', d(11, 15), 'Cards'],
      ['Put up the tree & decorations', d(11, 29), 'Decorating'],
      ['Plan the Christmas dinner menu', d(12, 5), 'Food'],
      ['Mail Christmas cards', d(12, 10), 'Cards'],
      ['Finish wrapping gifts', d(12, 20), 'Gifts'],
    ].map(([title, due, category]) => ({ id: uid(), title, due, category, priority: 'Medium', done: false })),
  }
}

export type CarryKey = 'budget_categories' | 'recipes' | 'traditions' | 'cards' | 'decorations' | 'bucket_list'

export const CARRY_OPTIONS: { key: CarryKey; label: string; hint: string }[] = [
  { key: 'budget_categories', label: 'Budget categories', hint: 'Names, links and planned amounts' },
  { key: 'recipes', label: 'Recipes', hint: 'Your saved recipes' },
  { key: 'traditions', label: 'Traditions', hint: 'Unchecked for the new season' },
  { key: 'cards', label: 'Christmas card list', hint: 'Sent & reply statuses reset' },
  { key: 'decorations', label: 'Decorations you own', hint: 'Marked as not yet set up' },
  { key: 'bucket_list', label: 'Bucket list', hint: 'Unchecked for the new season' },
]

/** Copy selected collections from a previous year, resetting seasonal statuses. */
export function carryOver(prev: YearData['collections'], keys: CarryKey[]): YearData['collections'] {
  const out: Partial<Record<CollectionName, Item[]>> = {}
  const fresh = (i: Item, patch: Partial<Item> = {}) => ({ ...i, ...patch, id: uid(), createdAt: Date.now() })
  for (const key of keys) {
    const items = prev[key] ?? []
    if (key === 'traditions') out.traditions = items.map((i) => fresh(i, { done: false, date: '' }))
    else if (key === 'cards') out.cards = items.map((i) => fresh(i, { sent: false, replied: false }))
    else if (key === 'decorations')
      out.decorations = items
        .filter((i) => i.status === 'Own' || i.status === 'Bought')
        .map((i) => fresh(i, { status: 'Own', setUp: false, cost: '' }))
    else if (key === 'bucket_list') out.bucket_list = items.map((i) => fresh(i, { done: false }))
    else out[key] = items.map((i) => fresh(i))
  }
  return out
}
