import type { IconName } from '../components/Icon';

export interface ModuleManifest {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  path: string;
  /** Not built yet; shown as a dimmed tile. */
  soon?: boolean;
}

/** Add a microservice's front-end entry here and it appears on the dashboard and landing page. */
export const MODULES: ModuleManifest[] = [
  { id: 'journal', name: 'Journal', blurb: 'Meals, symptoms and the days someone felt unwell.', icon: 'book', path: '/app/journal' },
  { id: 'meals', name: 'Meal plan', blurb: 'Plan the week and build the grocery list.', icon: 'bowl', path: '#', soon: true },
  { id: 'chores', name: 'Chores', blurb: 'Who is doing what, and when.', icon: 'check', path: '#', soon: true },
  { id: 'meds', name: 'Medicine', blurb: 'Doses and refills, without the guesswork.', icon: 'pill', path: '#', soon: true },
];
