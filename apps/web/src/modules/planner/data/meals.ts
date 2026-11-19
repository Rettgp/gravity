import type { Item } from './PlannerContext'

export const OCCASIONS = ['Christmas Eve', 'Christmas Day'] as const
export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Other'] as const

export const OCCASION_EMOJI: Record<string, string> = { 'Christmas Eve': '🕯️', 'Christmas Day': '🎄' }

const LEGACY: Record<string, { occasion: string; meal: string }> = {
  'Christmas Eve': { occasion: 'Christmas Eve', meal: 'Dinner' },
  'Christmas Breakfast': { occasion: 'Christmas Day', meal: 'Breakfast' },
  'Christmas Lunch': { occasion: 'Christmas Day', meal: 'Lunch' },
  'Christmas Dinner': { occasion: 'Christmas Day', meal: 'Dinner' },
  'Holiday Baking': { occasion: 'Christmas Day', meal: 'Other' },
  Other: { occasion: 'Christmas Day', meal: 'Other' },
}

/**
 * Items saved before the Eve/Day split stored one combined value (e.g. "Christmas Breakfast")
 * in `occasion` (or `category` for recipes). Map those onto occasion + meal at read time;
 * the item is rewritten in the new shape the next time it is saved.
 */
export function withMealInfo<T extends Item>(item: T, legacyKey: 'occasion' | 'category' = 'occasion'): T & { occasion: string; meal: string } {
  const occasion = String(item.occasion ?? '')
  if ((OCCASIONS as readonly string[]).includes(occasion) && item.meal) return item as T & { occasion: string; meal: string }
  const legacy = LEGACY[String(item[legacyKey] ?? '')]
  if (legacy) return { ...item, occasion: legacy.occasion, meal: item.meal || legacy.meal }
  return { ...item, occasion: (OCCASIONS as readonly string[]).includes(occasion) ? occasion : '', meal: String(item.meal ?? '') }
}
