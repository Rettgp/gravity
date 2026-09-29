import type { Profile } from './schemas.js';

export const canManage = (p: Pick<Profile, 'managers'>, sub: string) => p.managers.includes(sub);
export const canReadDay = (p: Pick<Profile, 'managers'>, sub: string, dayShared: boolean) =>
  canManage(p, sub) || dayShared;

export function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}
export function isAllowed(email: string | undefined, list: string[]) {
  return !!email && list.map(normalizeEmail).includes(normalizeEmail(email));
}
