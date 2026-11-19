import { describe, expect, it } from 'vitest';
import { MODULES } from '../../modules/registry';
import { feedbackAreas } from './nav';

describe('feedbackAreas', () => {
  it('lists Home, every non-soon module, Family and Other, so a new module appears automatically', () => {
    const areas = feedbackAreas();
    for (const m of MODULES.filter((m) => !m.soon)) expect(areas).toContain(m.short ?? m.name);
    expect(areas).toEqual(expect.arrayContaining(['Home', 'Trips', 'Planner', 'Family']));
    expect(areas.at(-1)).toBe('Other');
    expect(areas.every((a) => a.length >= 1 && a.length <= 40)).toBe(true);
    expect(new Set(areas).size).toBe(areas.length);
  });
});
