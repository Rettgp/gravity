import { CandyCane, Gift, House, Package, ShoppingBag, type LucideIcon } from 'lucide-react'
import type { Item } from './PlannerContext'

export type GiftTagKey = 'purchased' | 'wrapped' | 'present' | 'stockingStuffer' | 'familyGift'

export type GiftTag = { key: GiftTagKey; label: string; icon: LucideIcon; tone: 'gold' | 'red' | 'green' }

/** Each tag is a boolean flag on the gift item, so older data keeps working. */
export const GIFT_TAGS: GiftTag[] = [
  { key: 'purchased', label: 'Purchased', icon: ShoppingBag, tone: 'gold' },
  { key: 'wrapped', label: 'Wrapped', icon: Package, tone: 'red' },
  { key: 'present', label: 'Present', icon: Gift, tone: 'red' },
  { key: 'stockingStuffer', label: 'Stocking Stuffer', icon: CandyCane, tone: 'green' },
  { key: 'familyGift', label: 'Family Gift', icon: House, tone: 'green' },
]

export const activeTags = (g: Item) => GIFT_TAGS.filter((t) => !!g[t.key])
