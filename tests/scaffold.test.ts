import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

describe.each(['planner'] as const)('%s scaffold', (name) => {
  it('pings for family, 401 anonymous, 403 for a stranger', async () => {
    const app = makeApp();
    expect(await app[name]('mom', 'GET', '/ping')).toEqual({ status: 200, body: { ok: true } });
    expect((await app[name](null, 'GET', '/ping')).status).toBe(401);
    expect((await app[name]('stranger', 'GET', '/ping')).status).toBe(403);
  });
});
