import { MemoryDb, type Req, type DayInput } from '@gravity/shared/server';
import { buildCoreRouter } from '../services/core/src/router';
import { buildJournalRouter } from '../services/journal/src/router';

export const FAMILY = ['mom@example.com', 'dad@example.com', 'teen@example.com'];
export const users = {
  mom: { sub: 'sub-mom', email: 'mom@example.com', name: 'Mom Jones' },
  dad: { sub: 'sub-dad', email: 'dad@example.com', name: 'Dad Jones' },
  teen: { sub: 'sub-teen', email: 'teen@example.com', name: 'Teen Jones' },
  stranger: { sub: 'sub-x', email: 'stranger@gmail.com', name: 'Eve' },
};
export type Who = keyof typeof users;

export function makeApp(allowed: string[] = FAMILY) {
  const db = new MemoryDb();
  const allowlist = async () => allowed;
  const core = buildCoreRouter({ db, table: 'core', allowlist });
  const journal = buildJournalRouter({ db, table: 'journal', coreTable: 'core', allowlist, now: () => new Date('2026-09-28T12:00:00Z') });
  const call = (router: typeof core, who: Who | null, method: string, path: string, body?: unknown, query: Record<string, string> = {}) =>
    router({ method, path, body, query, user: who ? users[who] : null } satisfies Req);
  return {
    db,
    core: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(core, who, m, '/api/core' + p, b, q),
    journal: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(journal, who, m, '/api/journal' + p, b, q),
  };
}

export const day = (over: Partial<DayInput> = {}): DayInput => ({
  meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
  unwell: false,
  symptoms: [],
  shared: false,
  ...over,
});
