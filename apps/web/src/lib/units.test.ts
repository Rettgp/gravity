import { describe, expect, it } from 'vitest';
import { tempLabel, tempValue } from './units';
import { metricsFor, toDisplayDays } from '../modules/health/metrics';

describe('temperature units', () => {
  it('converts absolute temperatures and differences differently', () => {
    expect(tempValue(0, 'F')).toBe(32);
    expect(tempValue(100, 'F')).toBe(212);
    expect(tempValue(32.4, 'F')).toBeCloseTo(90.32, 2);
    expect(tempValue(1, 'F', true)).toBeCloseTo(1.8, 5); // a difference has no +32 offset
    expect(tempValue(0.3, 'F', true)).toBeCloseTo(0.54, 5);
    expect(tempValue(32.4, 'C')).toBe(32.4);
    expect(tempValue(0.3, 'C', true)).toBe(0.3);
    expect(tempLabel('F')).toBe('°F');
    expect(tempLabel('C')).toBe('°C');
  });

  it('shows skin temperature in the chosen unit and leaves everything else alone', () => {
    const days = [{ date: '2026-09-28', skinTempC: 32, skinTempDelta: 0.5, restingHr: 64 }, { date: '2026-09-27', steps: 5000 }];
    const f = toDisplayDays(days, 'F');
    expect(f[0]).toEqual({ date: '2026-09-28', skinTempC: 89.6, skinTempDelta: 0.9, restingHr: 64 });
    expect(f[1]).toBe(days[1]); // untouched days are not copied
    expect(days[0]!.skinTempC).toBe(32); // input is not mutated
    expect(toDisplayDays(days, 'C')).toBe(days);
    expect(metricsFor('F').find((m) => m.key === 'skinTempC')!.unit).toBe('°F');
    expect(metricsFor('C').find((m) => m.key === 'skinTempC')!.unit).toBe('°C');
    expect(metricsFor('F').find((m) => m.key === 'restingHr')!.unit).toBe('bpm');
  });
});
