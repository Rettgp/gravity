import { describe, expect, it } from 'vitest';
import { acceptDigits, digitsFromClock, displayDigits, finishDigits, isComplete, isPm, to24 } from './clock';

describe('typing a time with digits', () => {
  it('fills hour then minute as you type', () => {
    expect(displayDigits(acceptDigits('6'))).toBe('6:');
    expect(displayDigits(acceptDigits('64'))).toBe('6:4');
    expect(displayDigits(acceptDigits('645'))).toBe('6:45');
    expect(displayDigits(acceptDigits('1030'))).toBe('10:30');
    expect(displayDigits(acceptDigits('1'))).toBe('1');
    expect(displayDigits(acceptDigits('12'))).toBe('12:');
    expect(displayDigits(acceptDigits('13'))).toBe('1:3');
    expect(displayDigits(acceptDigits('0645'))).toBe('6:45');
  });
  it('drops digits that cannot be valid', () => {
    expect(acceptDigits('690')).toBe('60'); // the 9 cannot start the minutes, so it is dropped
    expect(acceptDigits('00')).toBe('0');
    expect(acceptDigits('1999')).toBe('1');
  });
  it('knows when an entry is complete and finishes partial ones', () => {
    expect(isComplete('645')).toBe(true);
    expect(isComplete('64')).toBe(false);
    expect(finishDigits('6')).toEqual({ hour: 6, minute: 0 });
    expect(finishDigits('64')).toEqual({ hour: 6, minute: 4 });
    expect(finishDigits('1')).toEqual({ hour: 1, minute: 0 });
    expect(finishDigits('0')).toBeNull();
    expect(finishDigits('')).toBeNull();
  });
  it('converts between 24h and 12h with AM/PM', () => {
    expect(digitsFromClock('09:03')).toBe('903');
    expect(digitsFromClock('00:15')).toBe('1215');
    expect(digitsFromClock('13:05')).toBe('105');
    expect(isPm('12:00')).toBe(true);
    expect(isPm('11:59')).toBe(false);
    expect(to24(12, 5, false)).toBe('00:05');
    expect(to24(12, 5, true)).toBe('12:05');
    expect(to24(6, 45, true)).toBe('18:45');
  });
});
