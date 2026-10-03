import { randomUUID } from 'node:crypto';
import {
  HttpError,
  canManage,
  createRouter,
  managerInput,
  normalizeEmail,
  parse,
  profileInput,
  profilePatch,
  type Db,
  type Me,
  type Profile,
  type ProfileSummary,
  type Route,
} from '@gravity/shared/server';

export const CORE_PREFIX = '/api/core';

export interface CoreDeps {
  db: Db;
  table: string;
  allowlist: () => Promise<string[]>;
}

const summary = (p: Profile): ProfileSummary => ({ id: p.id, name: p.name, color: p.color, ...(p.picture ? { picture: p.picture } : {}) });
/** Only Google-hosted profile photos are ever stored or shown (nothing arbitrary, nothing over http). */
const safePicture = (url: string | undefined) => (url && url.length <= 500 && /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/\S+$/i.test(url) ? url : undefined);

export function buildCoreRouter({ db, table, allowlist }: CoreDeps) {
  const loadProfile = async (id: string) => {
    const it = await db.get(table, `PROFILE#${id}`, 'META');
    if (!it) throw new HttpError(404, 'Profile not found');
    return it as unknown as Profile & { pk: string; sk: string };
  };
  const manageable = async (id: string, sub: string) => {
    const p = await loadProfile(id);
    if (!canManage(p, sub)) throw new HttpError(404, 'Profile not found'); // don't reveal existence
    return p;
  };
  const savePublic = async (p: Profile) => {
    await db.put(table, { pk: `PROFILE#${p.id}`, sk: 'META', ...p });
    await db.put(table, { pk: 'FAMILY', sk: `PROFILE#${p.id}`, ...summary(p) });
    for (const sub of p.managers) await db.put(table, { pk: `USER#${sub}`, sk: `PROFILE#${p.id}`, profileId: p.id });
  };
  const myProfiles = async (sub: string) => {
    const links = await db.query(table, `USER#${sub}`, 'PROFILE#');
    const out: Profile[] = [];
    for (const l of links) {
      const it = await db.get(table, `PROFILE#${l.profileId as string}`, 'META');
      if (it) out.push(it as unknown as Profile);
    }
    return out;
  };

  const routes: Route[] = [
    {
      method: 'GET',
      path: '/me',
      handler: async ({ user }) => {
        const email = normalizeEmail(user.email);
        let meta = await db.get(table, `USER#${user.sub}`, 'META');
        if (!meta) {
          const id = randomUUID();
          const self: Profile = {
            id,
            name: (user.name ?? email.split('@')[0] ?? 'Me').split(' ')[0]!,
            color: '#2c95c8',
            ...(safePicture(user.picture) ? { picture: safePicture(user.picture) } : {}),
            kind: 'self',
            ownerSub: user.sub,
            managers: [user.sub],
            shareByDefault: false,
          };
          await savePublic(self);
          meta = { pk: `USER#${user.sub}`, sk: 'META', sub: user.sub, email, name: user.name, defaultProfileId: id };
        } else {
          meta = { ...meta, email, name: user.name ?? meta.name };
          // Keep the person's own avatar in step with their Google photo (it changes when they change it, or on sign-in).
          const own = (await db.get(table, `PROFILE#${meta.defaultProfileId as string}`, 'META')) as unknown as Profile | undefined;
          const pic = safePicture(user.picture);
          if (own && own.kind === 'self' && own.picture !== pic) {
            const { picture: _old, ...rest } = own;
            await savePublic({ ...rest, ...(pic ? { picture: pic } : {}) });
          }
        }
        await db.put(table, meta);
        await db.put(table, { pk: `EMAIL#${email}`, sk: 'META', sub: user.sub });
        const family = (await db.query(table, 'FAMILY', 'PROFILE#')) as unknown as ProfileSummary[];
        const me: Me = {
          user: { sub: user.sub, email, name: user.name },
          defaultProfileId: meta.defaultProfileId as string,
          profiles: await myProfiles(user.sub),
          family: family.map(({ id, name, color, picture }) => ({ id, name, color, ...(picture ? { picture } : {}) })),
        };
        return me;
      },
    },
    { method: 'GET', path: '/profiles', handler: async ({ user }) => myProfiles(user.sub) },
    {
      method: 'POST',
      path: '/profiles',
      handler: async ({ user, body }) => {
        const input = parse(profileInput, body);
        const p: Profile = { id: randomUUID(), kind: 'managed', ownerSub: user.sub, managers: [user.sub], ...input };
        await savePublic(p);
        return { status: 201, body: p };
      },
    },
    {
      method: 'PATCH',
      path: '/profiles/:id',
      handler: async ({ user, params, body }) => {
        const p = await manageable(params.id!, user.sub);
        const patch = parse(profilePatch, body);
        const next: Profile = { ...(p as Profile), ...patch, id: p.id, kind: p.kind, ownerSub: p.ownerSub, managers: p.managers };
        await savePublic(next);
        return next;
      },
    },
    {
      method: 'DELETE',
      path: '/profiles/:id',
      handler: async ({ user, params }) => {
        const p = await manageable(params.id!, user.sub);
        if (p.kind === 'self') throw new HttpError(400, 'You cannot delete your own profile');
        await db.delete(table, `PROFILE#${p.id}`, 'META');
        await db.delete(table, 'FAMILY', `PROFILE#${p.id}`);
        for (const sub of p.managers) await db.delete(table, `USER#${sub}`, `PROFILE#${p.id}`);
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/profiles/:id/managers',
      handler: async ({ user, params, body }) => {
        const p = await manageable(params.id!, user.sub);
        const { email } = parse(managerInput, body);
        const norm = normalizeEmail(email);
        if (!(await allowlist()).map(normalizeEmail).includes(norm)) throw new HttpError(400, 'That email is not on the family allowlist');
        const target = await db.get(table, `EMAIL#${norm}`, 'META');
        if (!target) throw new HttpError(404, 'They need to sign in once before they can be added');
        const sub = target.sub as string;
        const next: Profile = { ...(p as Profile), managers: [...new Set([...p.managers, sub])] };
        await savePublic(next);
        return next;
      },
    },
    {
      method: 'DELETE',
      path: '/profiles/:id/managers/:sub',
      handler: async ({ user, params }) => {
        const p = await manageable(params.id!, user.sub);
        if (params.sub === p.ownerSub) throw new HttpError(400, 'The owner cannot be removed');
        const next: Profile = { ...(p as Profile), managers: p.managers.filter((s) => s !== params.sub) };
        await savePublic(next);
        await db.delete(table, `USER#${params.sub}`, `PROFILE#${p.id}`);
        return next;
      },
    },
  ];

  return createRouter({ prefix: CORE_PREFIX, routes, allowlist });
}
