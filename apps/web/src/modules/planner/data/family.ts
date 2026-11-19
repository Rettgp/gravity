import { useLocation } from 'react-router-dom'
import type { Field } from '../components/ItemForm'
import type { CollectionName, Item } from './PlannerContext'

import { FAMILY, nextBirthday } from '../../../lib/family'

export { FAMILY, nextBirthday }
export const FAMILY_NAMES = FAMILY.map((f) => f.name)

/** Days since the most recent birthday on or before `today` (0 on the day itself). */
export function daysSinceBirthday(born: string, today = new Date()) {
  const { date, days } = nextBirthday(born, today)
  if (days === 0) return 0
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const last = new Date(date.getFullYear() - 1, date.getMonth(), date.getDate())
  return Math.round((t.getTime() - last.getTime()) / 86_400_000)
}

/** Proper family-member name for free text like "marshall ", or undefined. */
export const familyName = (s: unknown) => FAMILY_NAMES.find((n) => n.toLowerCase() === String(s ?? '').trim().toLowerCase())

/** Birthday gifts are keyed by recipient, everything else by member. */
export const memberOf = (i: Item) => familyName(i.member ?? i.recipient)

export const MEMBER_FIELD: Field = { key: 'member', label: 'Family member', type: 'select', options: FAMILY_NAMES, placeholder: 'Whole family', half: true }

type Shared = 'budget_categories' | 'expenses' | 'gifts' | 'decorations'

/** Birthday pages live under /app/planner/birthday and keep their items in bday_* collections. */
export function useOccasion() {
  const birthday = useLocation().pathname.startsWith('/app/planner/birthday')
  return { birthday, col: (c: Shared) => (birthday ? `bday_${c}` : c) as CollectionName }
}
