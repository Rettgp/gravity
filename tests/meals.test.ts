import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

const importFile = (...names: string[]) => ({
  version: 1,
  recipes: names.map((name, i) => ({
    tandoorId: i + 1,
    name,
    servings: 4,
    keywords: i === 0 ? ['Dinner'] : ['Dessert'],
    ingredients: [{ name: 'Flour', amount: 2, unit: 'cups' }, { name: 'Eggs', amount: 3 }],
  })),
});

describe('meals: access', () => {
  it('needs a signed-in, allowlisted family member for everything', async () => {
    const { meals } = makeApp();
    for (const [m, p] of [['GET', '/recipes'], ['GET', '/plan'], ['GET', '/grocery'], ['POST', '/grocery/add']] as const) {
      expect((await meals(null, m, p)).status).toBe(401);
      expect((await meals('stranger', m, p)).status).toBe(403);
    }
  });
});

describe('meals: recipe library', () => {
  it('imports Tandoor recipes, re-imports without duplicating, and drops ones removed from Tandoor', async () => {
    const { meals } = makeApp();
    expect((await meals('mom', 'POST', '/recipes/import', importFile('Chili', 'Brownies', 'Soup'))).body).toEqual({ imported: 3, removed: 0 });
    expect(((await meals('mom', 'GET', '/recipes')).body as unknown[]).length).toBe(3);

    expect((await meals('dad', 'POST', '/recipes/import', importFile('Chili', 'Brownies'))).body).toEqual({ imported: 2, removed: 1 });
    const list = (await meals('dad', 'GET', '/recipes')).body as { name: string; ingredientCount: number; source: string }[];
    expect(list.map((r) => r.name)).toEqual(['Brownies', 'Chili']);
    expect(list[0]).toMatchObject({ ingredientCount: 2, source: 'tandoor' });
    // The list stays light: ingredients only come with a single recipe.
    expect(list[0]).not.toHaveProperty('ingredients');
    const one = (await meals('dad', 'GET', '/recipes/t1')).body as { ingredients: unknown[] };
    expect(one.ingredients).toHaveLength(2);
  });

  it('keeps recipes added by hand across imports, and refuses to delete Tandoor ones', async () => {
    const { meals } = makeApp();
    const mine = (await meals('mom', 'POST', '/recipes', { name: 'Grandma pie', ingredients: [{ name: 'Apples' }] })).body as { id: string };
    await meals('mom', 'POST', '/recipes/import', importFile('Chili'));
    expect(((await meals('mom', 'GET', '/recipes')).body as unknown[]).length).toBe(2);
    expect((await meals('mom', 'DELETE', '/recipes/t1')).status).toBe(400);
    expect((await meals('mom', 'DELETE', '/recipes/' + mine.id)).status).toBe(204);
    expect((await meals('mom', 'GET', '/recipes/' + mine.id)).status).toBe(404);
  });

  it('rejects a malformed import before touching anything', async () => {
    const { meals } = makeApp();
    await meals('mom', 'POST', '/recipes/import', importFile('Chili'));
    expect((await meals('mom', 'POST', '/recipes/import', { version: 2, recipes: [] })).status).toBe(400);
    expect((await meals('mom', 'POST', '/recipes/import', { version: 1, recipes: [{ name: 'No id', ingredients: [] }] })).status).toBe(400);
    expect(((await meals('mom', 'GET', '/recipes')).body as unknown[]).length).toBe(1);
  });
});

describe('meals: plan', () => {
  it('plans a recipe in any of the five slots, copying its ingredients in', async () => {
    const { meals } = makeApp();
    await meals('mom', 'POST', '/recipes/import', importFile('Chili'));
    const made = await meals('mom', 'POST', '/plan', { date: '2026-09-29', slot: 'dinner', recipeId: 't1' });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ title: 'Chili', slot: 'dinner', servings: 4, recipeId: 't1' });
    await meals('mom', 'POST', '/plan', { date: '2026-09-29', slot: 'breakfast', title: 'Cereal' });
    for (const slot of ['lunch', 'snack', 'dessert']) expect((await meals('dad', 'POST', '/plan', { date: '2026-09-30', slot, title: slot })).status).toBe(201);
    expect((await meals('mom', 'POST', '/plan', { date: '2026-09-30', slot: 'brunch', title: 'x' })).status).toBe(400);
    expect((await meals('mom', 'POST', '/plan', { date: '2026-09-30', slot: 'dinner' })).status).toBe(400);
    expect((await meals('mom', 'POST', '/plan', { date: '2026-09-30', slot: 'dinner', recipeId: 'nope' })).status).toBe(404);

    // The plan keeps working after the recipe leaves the library.
    await meals('mom', 'POST', '/recipes/import', importFile());
    const plan = (await meals('dad', 'GET', '/plan', undefined, { from: '2026-09-28', to: '2026-10-04' })).body as { title: string; slot: string; ingredients: unknown[] }[];
    expect(plan.map((e) => e.slot)).toEqual(['breakfast', 'dinner', 'lunch', 'snack', 'dessert']);
    expect(plan.find((e) => e.title === 'Chili')!.ingredients).toHaveLength(2);
  });

  it('reads across a month boundary and only returns the asked-for days', async () => {
    const { meals } = makeApp();
    await meals('mom', 'POST', '/plan', { date: '2026-09-30', slot: 'dinner', title: 'A' });
    await meals('mom', 'POST', '/plan', { date: '2026-10-01', slot: 'dinner', title: 'B' });
    await meals('mom', 'POST', '/plan', { date: '2026-10-09', slot: 'dinner', title: 'C' });
    const get = async (from: string, to: string) => ((await meals('mom', 'GET', '/plan', undefined, { from, to })).body as { title: string }[]).map((e) => e.title);
    expect(await get('2026-09-28', '2026-10-04')).toEqual(['A', 'B']);
    expect(await get('2026-10-01', '2026-10-31')).toEqual(['B', 'C']);
    expect((await meals('mom', 'GET', '/plan', undefined, { from: '2026-01-01', to: '2026-12-31' })).status).toBe(400);
    expect((await meals('mom', 'GET', '/plan', undefined, { from: 'soon' })).status).toBe(400);
  });

  it('removes a planned meal', async () => {
    const { meals } = makeApp();
    const e = (await meals('mom', 'POST', '/plan', { date: '2026-09-29', slot: 'dinner', title: 'Tacos' })).body as { id: string };
    expect((await meals('dad', 'DELETE', '/plan/2026-09-29/' + e.id)).status).toBe(204);
    expect(((await meals('mom', 'GET', '/plan', undefined, { from: '2026-09-29', to: '2026-09-29' })).body as unknown[]).length).toBe(0);
  });

  it('caps a day so a bug cannot fill the table', async () => {
    const { meals } = makeApp();
    for (let i = 0; i < 30; i++) await meals('mom', 'POST', '/plan', { date: '2026-09-29', slot: 'snack', title: 's' + i });
    expect((await meals('mom', 'POST', '/plan', { date: '2026-09-29', slot: 'snack', title: 'one more' })).status).toBe(400);
  });
});

describe('meals: grocery list', () => {
  const list = async (app: ReturnType<typeof makeApp>) => (await app.meals('mom', 'GET', '/grocery')).body as { id: string; name: string; state: string; note?: string }[];

  it('saves every item so it can be tapped back onto the list instead of retyped', async () => {
    const app = makeApp();
    await app.meals('mom', 'POST', '/grocery/add', { items: [{ name: 'Milk' }, { name: 'Cherry Tomatoes' }] });
    expect((await list(app)).map((i) => [i.name, i.state])).toEqual([['Cherry Tomatoes', 'need'], ['Milk', 'need']]);

    await app.meals('dad', 'PATCH', '/grocery/milk', { state: 'got' });
    expect((await app.meals('dad', 'POST', '/grocery/clear-done')).body).toEqual({ cleared: 1 });
    expect((await list(app)).find((i) => i.id === 'milk')!.state).toBe('off');

    // Next week: one tap, no typing. Typing it again just finds the same saved item.
    await app.meals('mom', 'PATCH', '/grocery/milk', { state: 'need' });
    await app.meals('mom', 'POST', '/grocery/add', { items: [{ name: '  cherry   tomatoes ' }] });
    const items = await list(app);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.state)).toEqual(['need', 'need']);
  });

  it('stacks quantities for an item already on the list, and starts fresh once it was bought', async () => {
    const app = makeApp();
    await app.meals('mom', 'POST', '/grocery/add', { items: [{ name: 'Flour', note: '2 cups' }] });
    await app.meals('mom', 'POST', '/grocery/add', { items: [{ name: 'flour', note: '1 lb' }, { name: 'Flour', note: '2 cups' }] });
    expect((await list(app))[0]).toMatchObject({ name: 'Flour', note: '2 cups, 1 lb' });
    await app.meals('mom', 'PATCH', '/grocery/flour', { state: 'off' });
    expect((await list(app))[0]!.note).toBeUndefined();
    await app.meals('mom', 'POST', '/grocery/add', { items: [{ name: 'Flour', note: '3 cups' }] });
    expect((await list(app))[0]).toMatchObject({ state: 'need', note: '3 cups' });
  });

  it('adds the ingredients picked from a planned meal', async () => {
    const app = makeApp();
    await app.meals('mom', 'POST', '/recipes/import', importFile('Chili'));
    const e = (await app.meals('mom', 'POST', '/plan', { date: '2026-09-29', slot: 'dinner', recipeId: 't1' })).body as { ingredients: { name: string }[] };
    await app.meals('mom', 'POST', '/grocery/add', { items: [{ name: e.ingredients[1]!.name, note: '3' }] });
    expect((await list(app)).map((i) => i.name)).toEqual(['Eggs']);
  });

  it('removes an item for good, and handles unknown ones', async () => {
    const app = makeApp();
    await app.meals('mom', 'POST', '/grocery/add', { items: [{ name: 'Milk' }] });
    expect((await app.meals('mom', 'DELETE', '/grocery/milk')).status).toBe(204);
    expect(await list(app)).toEqual([]);
    expect((await app.meals('mom', 'PATCH', '/grocery/milk', { state: 'need' })).status).toBe(404);
    expect((await app.meals('mom', 'PATCH', '/grocery/milk', { state: 'bought' })).status).toBe(400);
  });
});
