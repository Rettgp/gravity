import type { IconName } from '../components/Icon';

export interface ModuleManifest {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  path: string;
  /** Not built yet; shown as a dimmed tile. */
  soon?: boolean;
  /** Shorter name for the sidebar. */
  short?: string;
  /** Sub-pages. Listed in the sidebar (a drawer on phones) when the module is open. `icon` is an IconName. */
  /** `group` puts a small header above a run of sections in the sidebar (e.g. Christmas, Birthdays). */
  sections?: { label: string; path: string; icon?: string; group?: string }[];
}

/** Add a microservice's front-end entry here and it appears on the dashboard and landing page. */
export const MODULES: ModuleManifest[] = [
  { id: 'journal', name: 'Journal', blurb: 'Meals, symptoms and the days someone felt unwell.', icon: 'book', path: '/app/journal' },
  { id: 'health', name: 'Health', blurb: 'Sleep, heart rate and activity from your watch and phone.', icon: 'heart', path: '/app/health' },
  { id: 'meals', name: 'Meal plan', short: 'Meals', blurb: 'Plan the week and build the grocery list.', icon: 'bowl', path: '/app/meals',
    sections: [
      { label: 'Plan', path: '/app/meals?tab=plan', icon: 'calendar' },
      { label: 'Grocery', path: '/app/meals?tab=grocery', icon: 'check' },
      { label: 'Recipes', path: '/app/meals?tab=recipes', icon: 'bowl' },
    ] },
  { id: 'planner', name: 'Planner', blurb: 'Christmas and birthday gifts, budgets and lists.', icon: 'spark', path: '/app/planner',
    sections: [
      { label: 'Dashboard', path: '/app/planner/christmas/dashboard', icon: 'dashboard', group: 'Christmas' },
      { label: 'Setup', path: '/app/planner/christmas/setup', icon: 'setup', group: 'Christmas' },
      { label: 'To-Do', path: '/app/planner/christmas/todos', icon: 'check', group: 'Christmas' },
      { label: 'Budget', path: '/app/planner/christmas/budget', icon: 'budget', group: 'Christmas' },
      { label: 'Gifts', path: '/app/planner/christmas/gifts', icon: 'gift', group: 'Christmas' },
      { label: 'Cards', path: '/app/planner/christmas/cards', icon: 'mail', group: 'Christmas' },
      { label: 'Decor', path: '/app/planner/christmas/decorations', icon: 'tree', group: 'Christmas' },
      { label: 'Shopping', path: '/app/planner/christmas/shopping', icon: 'cart', group: 'Christmas' },
      { label: 'Meals', path: '/app/planner/christmas/meals', icon: 'chef', group: 'Christmas' },
      { label: 'Traditions', path: '/app/planner/christmas/traditions', icon: 'spark', group: 'Christmas' },
      { label: 'Travel', path: '/app/planner/christmas/travel', icon: 'luggage', group: 'Christmas' },
      { label: 'Budget', path: '/app/planner/birthday/budget', icon: 'budget', group: 'Birthdays' },
      { label: 'Gifts', path: '/app/planner/birthday/gifts', icon: 'gift', group: 'Birthdays' },
      { label: 'Themes', path: '/app/planner/birthday/decorations', icon: 'party', group: 'Birthdays' },
      { label: 'Yes Day', path: '/app/planner/birthday/yes-day', icon: 'yes', group: 'Birthdays' },
    ] },
  { id: 'trips', name: 'Trips', blurb: 'Itineraries, packing and costs for family trips.', icon: 'calendar', path: '/app/trips' },
  { id: 'chores', name: 'Chores', blurb: 'Who is doing what, and when.', icon: 'check', path: '#', soon: true },
  { id: 'meds', name: 'Medicine', blurb: 'The family medicine cabinet, and what was taken when.', icon: 'pill', path: '/app/journal?cabinet=1' },
];
