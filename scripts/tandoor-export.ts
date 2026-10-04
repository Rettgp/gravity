/**
 * Reads your recipes from Tandoor and writes tandoor-recipes.json, which the Meals > Recipes tab imports.
 *
 * Run it on any computer that can reach Tandoor (e.g. with Tailscale switched on):
 *   TANDOOR_URL=https://nas.your-tailnet.ts.net TANDOOR_TOKEN=tda_xxx npm run tandoor:export
 *
 * It only reads, and the token never leaves this machine: Gravity (in AWS) cannot reach your NAS and never sees it.
 * Create a token in Tandoor under Settings > API.
 */
import { writeFileSync } from 'node:fs';

const base = (process.env.TANDOOR_URL ?? '').replace(/\/+$/, '');
const token = process.env.TANDOOR_TOKEN ?? '';
const out = process.argv[2] ?? 'tandoor-recipes.json';
if (!base || !token) {
  console.error('Set TANDOOR_URL (e.g. http://nas:8080) and TANDOOR_TOKEN (Tandoor > Settings > API), then run again.');
  process.exit(1);
}

let scheme = 'Bearer';
async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(base + path, { headers: { authorization: scheme + ' ' + token, accept: 'application/json' } });
    // Older Tandoor versions want "Token <key>" instead of "Bearer <token>".
    if (res.status === 401 && attempt === 0 && scheme === 'Bearer') {
      scheme = 'Token';
      continue;
    }
    if (!res.ok) throw new Error(`Tandoor said ${res.status} for ${path}${res.status === 401 || res.status === 403 ? ' (check the token)' : ''}`);
    return (await res.json()) as T;
  }
  throw new Error('unreachable');
}

interface Overview {
  id: number;
  name: string;
  servings?: number;
  keywords?: { label?: string; name?: string }[];
}
interface Detail extends Overview {
  steps?: { ingredients?: { food?: { name?: string } | null; unit?: { name?: string } | null; amount?: number; note?: string; is_header?: boolean; no_amount?: boolean }[] }[];
}

const clip = (s: string | undefined, n: number) => (s ?? '').trim().slice(0, n);

async function main() {
  const overviews: Overview[] = [];
  for (let page = 1; ; page++) {
    const r = await get<{ results: Overview[]; next: string | null }>(`/api/recipe/?page_size=100&page=${page}`);
    overviews.push(...r.results);
    if (!r.next) break;
  }
  console.log(`Found ${overviews.length} recipes. Reading ingredients...`);

  const recipes: unknown[] = [];
  let done = 0;
  const queue = [...overviews];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let o = queue.shift(); o; o = queue.shift()) {
        const d = await get<Detail>(`/api/recipe/${o.id}/`);
        const ingredients = (d.steps ?? [])
          .flatMap((s) => s.ingredients ?? [])
          .filter((i) => !i.is_header && i.food?.name?.trim())
          .slice(0, 120)
          .map((i) => {
            const amount = !i.no_amount && typeof i.amount === 'number' && i.amount > 0 && i.amount <= 100000 ? i.amount : undefined;
            return {
              name: clip(i.food!.name, 120),
              ...(amount ? { amount } : {}),
              ...(clip(i.unit?.name, 40) ? { unit: clip(i.unit?.name, 40) } : {}),
              ...(clip(i.note, 120) ? { note: clip(i.note, 120) } : {}),
            };
          });
        recipes.push({
          tandoorId: d.id,
          name: clip(d.name, 160) || 'Untitled recipe',
          ...(d.servings && d.servings >= 1 && d.servings <= 500 ? { servings: Math.round(d.servings) } : {}),
          keywords: (d.keywords ?? []).map((k) => clip(k.label ?? k.name, 40)).filter(Boolean).slice(0, 30),
          url: clip(`${base}/view/recipe/${d.id}`, 300),
          ingredients,
        });
        process.stdout.write(`\r${++done}/${overviews.length}`);
      }
    }),
  );
  recipes.sort((a, b) => (a as { tandoorId: number }).tandoorId - (b as { tandoorId: number }).tandoorId);
  writeFileSync(out, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), recipes }, null, 1));
  console.log(`\nWrote ${out}. In Gravity open Meals > Recipes > Import from Tandoor and choose that file.`);
}

main().catch((e) => {
  console.error('\n' + (e instanceof Error ? e.message : e));
  process.exit(1);
});
