import { addDays } from './dates.js';
import { emptyDay, type Day, type FoodItem } from './schemas.js';

const BREAKFAST = ['Oatmeal', 'Scrambled eggs', 'Toast', 'Yogurt', 'Pancakes', 'Cereal with milk', 'Banana'];
const LUNCH = ['Turkey sandwich', 'Chicken salad', 'Tomato soup', 'Leftover pasta', 'Rice bowl', 'Grilled cheese'];
const DINNER = ['Tacos', 'Salmon and veggies', 'Spaghetti', 'Stir fry', 'Pizza', 'Burgers', 'Chili'];
const SNACKS = ['Apple', 'Crackers', 'Trail mix', 'Ice cream', 'Popcorn'];

const pick = (list: string[], n: number): FoodItem[] => [{ text: list[n % list.length]! }];

/** Deterministic pseudo-random so demo data (and tests) never flake. */
const rand = (n: number) => {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

/**
 * Builds `count` days ending at `end`. Pizza and ice cream tend to be followed by an unwell day, which gives
 * the insights view an obvious "suspect" and the calendar a few coral days.
 */
export function generateDemoDays(end: string, count = 45): Day[] {
  const days: Day[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addDays(end, -i);
    const n = count - i;
    const d = emptyDay(date);
    d.meals.breakfast = pick(BREAKFAST, Math.floor(rand(n) * 20));
    d.meals.lunch = pick(LUNCH, Math.floor(rand(n + 100) * 20));
    d.meals.dinner = pick(DINNER, Math.floor(rand(n + 200) * 20));
    if (rand(n + 300) > 0.5) d.meals.snacks = pick(SNACKS, Math.floor(rand(n + 400) * 20));
    days.push(d);
  }
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const trigger = [...prev.meals.dinner, ...prev.meals.snacks, ...days[i]!.meals.dinner].some((f) => /pizza|ice cream/i.test(f.text));
    if (trigger && rand(i + 500) > 0.15) {
      days[i]!.unwell = true;
      days[i]!.symptoms = [
        { name: rand(i) > 0.5 ? 'Stomach ache' : 'Nausea', severity: 2 + Math.floor(rand(i + 600) * 3) },
        ...(rand(i + 700) > 0.6 ? [{ name: 'Headache', severity: 2 }] : []),
      ];
    }
  }
  return days;
}
