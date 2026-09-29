import { expect, test } from '@playwright/test';

// Same access gates that run in Lambda, exercised over real HTTP through the dev proxy.
test.describe('api access control', () => {
  test('no credentials -> 401 on every service', async ({ request }) => {
    for (const path of ['/api/core/me', '/api/core/profiles', '/api/journal/shared?month=2026-09']) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });

  test('a signed-in stranger who is not on the allowlist -> 403', async ({ request }) => {
    const headers = { 'x-dev-user': 'stranger@gmail.com' };
    expect((await request.get('/api/core/me', { headers })).status()).toBe(403);
    expect((await request.get('/api/journal/shared?month=2026-09', { headers })).status()).toBe(403);
    expect((await request.post('/api/dev/seed', { headers })).status()).toBe(403);
  });

  test('a family member gets in, and a spoofed sub cannot read others', async ({ request }) => {
    const mom = { 'x-dev-user': 'mom@gravity.local' };
    const me = await request.get('/api/core/me', { headers: mom });
    expect(me.status()).toBe(200);
    const { defaultProfileId } = await me.json();
    const dad = { 'x-dev-user': 'dad@gravity.local' };
    await request.get('/api/core/me', { headers: dad });
    const res = await request.put('/api/journal/profiles/' + defaultProfileId + '/days/2026-09-01', {
      headers: dad,
      data: { meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, unwell: true, symptoms: [], shared: false },
    });
    expect(res.status()).toBe(404);
  });

  test('bad payloads are rejected with 400, unknown routes with 404', async ({ request }) => {
    const mom = { 'x-dev-user': 'mom@gravity.local' };
    const { defaultProfileId } = await (await request.get('/api/core/me', { headers: mom })).json();
    const bad = await request.put('/api/journal/profiles/' + defaultProfileId + '/days/not-a-date', { headers: mom, data: {} });
    expect(bad.status()).toBe(400);
    expect((await request.get('/api/core/nope', { headers: mom })).status()).toBe(404);
  });
});
