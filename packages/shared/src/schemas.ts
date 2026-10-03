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
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  shareByDefault: z.boolean().default(false),
});
export const profilePatch = profileInput.partial();
export const managerInput = z.object({ email: z.string().email() });

/** A glimmer: a small moment that brightened the day. Always visible to the family. */
export const MAX_GLIMMERS_PER_DAY = 3;
/** Data-URL length caps. Photos go to S3 via the API, so the limit is Lambda's 6 MB request/response (base64 inflates by a third). */
export const GLIMMER_FULL_MAX = 3_600_000;
export const GLIMMER_THUMB_MAX = 400_000;
const imageDataUrl = (max: number) =>
  z
    .string()
    .max(max, 'Image is too large')
    .regex(/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/]+=*$/, 'Expected a base64 JPEG, WebP or PNG');
export const glimmerInput = z
  .object({
    date: dateStr,
    caption: z.string().trim().max(280).optional(),
    image: z.object({ full: imageDataUrl(GLIMMER_FULL_MAX), thumb: imageDataUrl(GLIMMER_THUMB_MAX) }).optional(),
  })
  .refine((g) => !!g.caption || !!g.image, 'Add a photo or a caption');
export type GlimmerInput = z.infer<typeof glimmerInput>;
export interface Glimmer {
  id: string;
  profileId: string;
  date: string;
  caption?: string;
  hasImage: boolean;
  createdAt: string;
}

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
  color: string;
  /** Google profile photo URL, only for a person's own profile when they signed in with Google. Others show their initial. */
  picture?: string;
  kind: 'self' | 'managed';
  ownerSub: string;
  managers: string[];
  shareByDefault: boolean;
}
export type ProfileSummary = Pick<Profile, 'id' | 'name' | 'color' | 'picture'>;
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
