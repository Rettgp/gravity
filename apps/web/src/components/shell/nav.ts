import {
  BookOpen, CalendarDays, CalendarHeart, ChefHat, Circle, Gift, HeartPulse, House, LayoutDashboard, ListChecks, Luggage, Mail, MapPin, PartyPopper, PiggyBank, Pill,
  Settings2, ShoppingCart, Sparkles, TreePine, Users, Utensils, type LucideIcon,
} from 'lucide-react';
import { MODULES, type ModuleManifest } from '../../modules/registry';

/** Registry icon names (the legacy Icon set) mapped to lucide for the shell. */
const ICONS: Record<string, LucideIcon> = {
  home: House, book: BookOpen, bowl: Utensils, heart: HeartPulse, spark: Sparkles, calendar: CalendarDays, users: Users, pill: Pill, check: ListChecks,
  dashboard: LayoutDashboard, setup: Settings2, budget: PiggyBank, gift: Gift, mail: Mail, tree: TreePine, cart: ShoppingCart, chef: ChefHat,
  luggage: Luggage, party: PartyPopper, yes: CalendarHeart, pin: MapPin,
};
export const iconFor = (name?: string): LucideIcon => ICONS[name ?? ''] ?? Circle;

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  soon?: boolean;
  sections?: ModuleManifest['sections'];
}
type Loc = { pathname: string; search: string };

export const HOME: NavItem = { id: 'home', label: 'Home', path: '/app', icon: House };
export const FAMILY: NavItem = { id: 'family', label: 'Family', path: '/app/profiles', icon: Users };
/** Home, every registered module, Family. Sidebar, tab bar and More sheet all read this. */
export const NAV: NavItem[] = [
  HOME,
  ...MODULES.map((m): NavItem => ({ id: m.id, label: m.short ?? m.name, path: m.path, icon: iconFor(m.icon), soon: m.soon, sections: m.sections })),
  FAMILY,
];

/** Where feedback can be filed: every non-`soon` NAV entry (so a new module appears on its own), then "Other". */
export const feedbackAreas = (): string[] => [...new Set([...NAV.filter((i) => !i.soon).map((i) => i.label), 'Other'])];

/** Does `path` (which may carry a ?query) match the current location? Home must match exactly. */
export function matches(path: string, loc: Loc, exact = false) {
  const [p = '', q] = path.split('?');
  const here = loc.pathname.replace(/\/$/, '') || '/';
  if (here !== p && (exact || !here.startsWith(p + '/'))) return false;
  return !q || loc.search.includes(q);
}
export const isActive = (item: NavItem, loc: Loc) => !item.soon && matches(item.path, loc, item.id === 'home');
/** The module whose sections the sub-navigation should show. */
export const activeItem = (loc: Loc) => NAV.find((i) => i.id !== 'home' && !i.soon && !i.path.includes('?') && matches(i.path, loc));
