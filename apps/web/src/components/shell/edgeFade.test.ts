import { describe, expect, it } from 'vitest';
import { updateFade } from './edgeFade';

const el = (scrollWidth: number, clientWidth: number, scrollLeft: number) => {
  const attrs = new Set<string>();
  const node = {
    scrollWidth, clientWidth, scrollLeft,
    toggleAttribute: (name: string, on: boolean) => void (on ? attrs.add(name) : attrs.delete(name)),
  };
  updateFade(node as unknown as HTMLElement);
  return [...attrs].sort();
};

describe('carousel edge fade', () => {
  it('no fade when everything fits', () => expect(el(300, 300, 0)).toEqual([]));
  it('right fade only at the start', () => expect(el(600, 300, 0)).toEqual(['data-fade-r']));
  it('both fades in the middle', () => expect(el(600, 300, 120)).toEqual(['data-fade-l', 'data-fade-r']));
  it('left fade only at the end (allowing sub-pixel rounding)', () => expect(el(600, 300, 299.5)).toEqual(['data-fade-l']));
});
