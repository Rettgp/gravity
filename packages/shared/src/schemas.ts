import { z } from 'zod';

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const monthStr = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
export const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type MealKey = (typeof MEAL_KEYS)[number];

export const foodItem = z.object({
  text: z.string().trim().min(1).max(80),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
export const symptom = z.object({
  name: z.string().trim().min(1).max(40),
  severity: z.number().int().min(1).max(5),
  notes: z.string().max(200).optional(),
});

const mealList = z.array(foodItem).max(30);
export const dayInput = z.object({
  meals: z.object({ breakfast: mealList, lunch: mealList, dinner: mealList, snacks: mealList }),
  unwell: z.boolean(),
  symptoms: z.array(symptom).max(20),
  notes: z.string().max(2000).optional(),
  shared: z.boolean(),
  expectedUpdatedAt: z.string().optional(),
});

export const profileInput = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  shareByDefault: z.boolean().default(false),
});
export const profilePatch = profileInput.partial();
export const managerInput = z.object({ email: z.string().email() });

export type FoodItem = z.infer<typeof foodItem>;
export type Symptom = z.infer<typeof symptom>;
export type DayInput = z.infer<typeof dayInput>;
export type ProfileInput = z.infer<typeof profileInput>;
export type Day = Omit<DayInput, 'expectedUpdatedAt'> & { date: string; updatedAt?: string; updatedBy?: string };
export interface DaySummary {
  date: string;
  unwell: boolean;
  mealCount: number;
  symptomCount: number;
  shared: boolean;
}
export interface SharedDaySummary {
  profileId: string;
  date: string;
  unwell: boolean;
  symptomCount: number;
}
export interface Profile {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: 'self' | 'managed';
  ownerSub: string;
  managers: string[];
  shareByDefault: boolean;
}
export type ProfileSummary = Pick<Profile, 'id' | 'name' | 'emoji' | 'color'>;
export interface Me {
  user: { sub: string; email: string; name?: string };
  defaultProfileId: string;
  profiles: Profile[];
  family: ProfileSummary[];
}
export interface Suspect {
  food: string;
  lift: number;
  unwellDays: number;
  exposedDays: number;
  dates: string[];
}
export interface Insights {
  loggedDays: number;
  unwellDays: number;
  suspects: Suspect[];
  symptoms: { name: string; count: number }[];
}

export const emptyDay = (date: string, shared = false): Day => ({
  date,
  meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
  unwell: false,
  symptoms: [],
  shared,
});
