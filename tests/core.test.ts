import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

const kid = { name: 'Junior', emoji: 'K', color: '#7c5cf0', shareByDefault: false };

describe('router gate', () => {
  it('401 without a user, 403 for non-allowlisted, 404 unknown, 405 wrong method', async () => {
    const app = makeApp();
    expect((await app.core(null, 'GET', '/me')).status).toBe(401);
    expect((await app.core('stranger', 'GET', '/me')).status).toBe(403);
    expect((await app.journal('stranger', 'GET', '/shared', undefined, { month: '2026-09' })).status).toBe(403);
    expect((await app.core('mom', 'GET', '/nope')).status).toBe(404);
    expect((await app.core('mom', 'DELETE', '/me')).status).toBe(405);
  });
  it('removing an email from the allowlist locks the user out immediately', async () => {
    const allowed = ['mom@example.com'];
    const app = makeApp(allowed);
    expect((await app.core('mom', 'GET', '/me')).status).toBe(200);
    allowed.length = 0;
    expect((await app.core('mom', 'GET', '/me')).status).toBe(403);
  });
});

describe('core: me + profiles', () => {
  it('auto-creates a self profile once and lists the family', async () => {
    const app = makeApp();
    const a = (await app.core('mom', 'GET', '/me')).body as any;
    const b = (await app.core('mom', 'GET', '/me')).body as any;
    expect(a.profiles).toHaveLength(1);
    expect(b.defaultProfileId).toBe(a.defaultProfileId);
    expect(a.profiles[0].kind).toBe('self');
    await app.core('dad', 'GET', '/me');
    expect(((await app.core('mom', 'GET', '/me')).body as any).family).toHaveLength(2);
  });

  it('creates managed profiles that only managers can change', async () => {
    const app = makeApp();
    await app.core('mom', 'GET', '/me');
    await app.core('dad', 'GET', '/me');
    const created = await app.core('mom', 'POST', '/profiles', kid);
    expect(created.status).toBe(201);
    const id = (created.body as any).id;
    expect((await app.core('dad', 'PATCH', '/profiles/' + id, { name: 'Hax' })).status).toBe(404);
    expect((await app.core('mom', 'PATCH', '/profiles/' + id, { name: 'Jr' })).status).toBe(200);
    expect((await app.core('mom', 'POST', '/profiles', { ...kid, color: 'red' })).status).toBe(400);
  });

  it('adds a co-manager only if allowlisted and already signed in; cannot remove owner', async () => {
    const app = makeApp();
    await app.core('mom', 'GET', '/me');
    const id = ((await app.core('mom', 'POST', '/profiles', kid)).body as any).id;
    const base = '/profiles/' + id + '/managers';
    expect((await app.core('mom', 'POST', base, { email: 'dad@example.com' })).status).toBe(404);
    await app.core('dad', 'GET', '/me');
    expect((await app.core('mom', 'POST', base, { email: 'nobody@x.com' })).status).toBe(400);
    expect((await app.core('mom', 'POST', base, { email: 'DAD@example.com' })).status).toBe(200);
    expect(((await app.core('dad', 'GET', '/profiles')).body as any[]).some((p) => p.id === id)).toBe(true);
    expect((await app.core('dad', 'DELETE', base + '/sub-mom')).status).toBe(400);
    expect((await app.core('mom', 'DELETE', base + '/sub-dad')).status).toBe(200);
    expect(((await app.core('dad', 'GET', '/profiles')).body as any[]).some((p) => p.id === id)).toBe(false);
  });

  it('cannot delete a self profile but can delete a managed one', async () => {
    const app = makeApp();
    const me = (await app.core('mom', 'GET', '/me')).body as any;
    expect((await app.core('mom', 'DELETE', '/profiles/' + me.defaultProfileId)).status).toBe(400);
    const id = ((await app.core('mom', 'POST', '/profiles', kid)).body as any).id;
    expect((await app.core('mom', 'DELETE', '/profiles/' + id)).status).toBe(204);
    expect(((await app.core('mom', 'GET', '/me')).body as any).family).toHaveLength(1);
  });
});
