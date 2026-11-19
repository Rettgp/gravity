import { num, sum } from '../lib/format'
import { memberOf } from './family'
import type { CollectionName, Item, YearData } from './PlannerContext'

type Cols = YearData['collections']
const get = (c: Cols, k: CollectionName) => c[k] ?? []

/** With `member`, only that family member's items count (birthday budgets). */
export function linkedActual(c: Cols, link: string, member?: string): number {
  const own = (k: CollectionName) => get(c, k).filter((i) => !member || memberOf(i) === member)
  switch (link) {
    case 'gifts':
      return sum(own('gifts'), giftCost)
    case 'shopping':
      return sum(own('shopping').filter((s) => s.purchased), (s) => (s.actual !== '' && s.actual != null ? s.actual : s.estCost))
    case 'decorations':
      return sum(own('decorations').filter((d) => d.status === 'Bought'), (d) => d.cost)
    case 'groceries':
      return sum(own('groceries').filter((g) => g.got), (g) => g.cost)
    default:
      return 0
  }
}

export type CategoryRow = { id: string; name: string; planned: number; actual: number; expenses: number; linked: number; link: string; item?: Item }

export function budgetSummary(c: Cols) {
  const cats = [...get(c, 'budget_categories')].sort((a, b) => num(a.order) - num(b.order) || String(a.name).localeCompare(b.name))
  const expenses = get(c, 'expenses')
  const ids = new Set(cats.map((x) => x.id))
  const rows: CategoryRow[] = cats.map((cat) => {
    const exp = sum(
      expenses.filter((e) => e.categoryId === cat.id),
      (e) => e.amount,
    )
    const linked = cat.link ? linkedActual(c, cat.link, cat.member) : 0
    return { id: cat.id, name: cat.name, planned: num(cat.planned), expenses: exp, linked, actual: exp + linked, link: cat.link || '', item: cat }
  })
  const orphan = sum(
    expenses.filter((e) => !ids.has(e.categoryId)),
    (e) => e.amount,
  )
  if (orphan) rows.push({ id: '_none', name: 'Uncategorized', planned: 0, expenses: orphan, linked: 0, actual: orphan, link: '' })
  const planned = rows.reduce((a, r) => a + r.planned, 0)
  const actual = rows.reduce((a, r) => a + r.actual, 0)
  return { rows, planned, actual, remaining: planned - actual }
}

/** A gift has one cost, kept in `actual`; gifts saved before that fall back to their old `budget`. */
export const hasCost = (g: Item) => String(g.actual ?? '').trim() !== '' || num(g.budget) > 0
export const giftCost = (g: Item) => (String(g.actual ?? '').trim() !== '' ? num(g.actual) : num(g.budget))

export function giftStats(gifts: Item[]) {
  const recipients = new Set(gifts.map((g) => String(g.recipient || '').trim().toLowerCase()).filter(Boolean))
  return {
    recipients: recipients.size,
    ideas: gifts.length,
    purchased: gifts.filter((g) => g.purchased).length,
    wrapped: gifts.filter((g) => g.wrapped).length,
    purchasedSpend: sum(gifts.filter((g) => g.purchased), giftCost),
    stockingStuffers: gifts.filter((g) => g.stockingStuffer).length,
    total: sum(gifts, giftCost),
  }
}

export function giftStage(g: Item): 'Idea' | 'Purchased' | 'Wrapped' {
  if (g.wrapped) return 'Wrapped'
  if (g.purchased) return 'Purchased'
  return 'Idea'
}

export type ProgressArea = { key: string; label: string; done: number; total: number; path: string }

export function progressAreas(c: Cols): ProgressArea[] {
  const count = (k: CollectionName, pred: (i: Item) => boolean, filter: (i: Item) => boolean = () => true) => {
    const list = get(c, k).filter(filter)
    return { done: list.filter(pred).length, total: list.length }
  }
  const areas: ProgressArea[] = [
    { key: 'todos', label: 'To-dos done', path: 'todos', ...count('todos', (i) => !!i.done) },
    { key: 'gifts', label: 'Gifts purchased', path: 'gifts', ...count('gifts', (i) => !!i.purchased) },
    { key: 'wrapped', label: 'Gifts wrapped', path: 'gifts', ...count('gifts', (i) => !!i.wrapped) },
    { key: 'cards', label: 'Cards sent', path: 'cards', ...count('cards', (i) => !!i.sent) },
    { key: 'decor', label: 'Decorations up', path: 'decorations', ...count('decorations', (i) => !!i.setUp, (i) => i.status !== 'Need to Buy') },
    { key: 'shopping', label: 'Shopping bought', path: 'shopping', ...count('shopping', (i) => !!i.purchased) },
    { key: 'groceries', label: 'Groceries bought', path: 'meals', ...count('groceries', (i) => !!i.got) },
    { key: 'bucket', label: 'Bucket list', path: 'traditions', ...count('bucket_list', (i) => !!i.done) },
    { key: 'packing', label: 'Packed for travel', path: 'travel', ...count('packing', (i) => !!i.packed) },
  ]
  return areas.filter((a) => a.total > 0)
}

export function overallProgress(c: Cols) {
  const areas = progressAreas(c)
  const done = areas.reduce((a, x) => a + x.done, 0)
  const total = areas.reduce((a, x) => a + x.total, 0)
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}
