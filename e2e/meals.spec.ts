import { expect, test } from '@playwright/test';
import { ART, signIn, watchErrors } from './helpers';

test.describe('meal plan', () => {
  test('import recipes, plan a dessert, tick ingredients onto the grocery list, shop, and reuse saved items', async ({ page }, info) => {
    const errors = watchErrors(page);
    const tag = info.project.name;
    const crumble = 'Mango crumble ' + tag;
    const oats = 'Rolled oats ' + tag;
    const mango = 'Mango ' + tag;
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, tag === 'mobile' ? 'teen' : 'mom');

    // Recipes arrive from the Tandoor export file (never from a live connection).
    await page.goto('/app/meals?tab=recipes');
    const file = {
      version: 1,
      recipes: [
        { tandoorId: 1, name: crumble, servings: 6, keywords: ['Desserts'], ingredients: [{ name: mango, amount: 3 }, { name: oats, amount: 1.5, unit: 'cups' }, { name: 'Butter', amount: 0.5, unit: 'cup' }] },
        { tandoorId: 2, name: 'Porridge ' + tag, keywords: ['Breakfast'], ingredients: [{ name: oats }] },
      ],
    };
    await page.locator('input[type=file]').setInputFiles({ name: 'tandoor-recipes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await expect(page.getByRole('status')).toContainText('Imported 2 recipes');
    await expect(page.getByText(crumble)).toBeVisible();
    await page.screenshot({ path: ART + '/meals-recipes-' + tag + '.png' });

    // A garbage file is rejected with a plain message.
    await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
    await expect(page.getByRole('alert')).toContainText('not a Tandoor export');

    // Plan it for dessert today. Recipes tagged for the chosen meal type are listed first.
    await page.goto('/app/meals');
    const today = page.locator('.ml-day.today');
    await today.getByRole('button', { name: /Add a meal on/ }).click();
    const add = page.getByRole('dialog', { name: 'Add a meal' });
    await add.getByRole('button', { name: 'Dessert' }).click();
    await expect(add.locator('.ml-pick').first()).toContainText(crumble);
    await add.getByRole('button', { name: new RegExp(crumble) }).click();
    await expect(add).toBeHidden();
    await expect(today.locator('.ml-entry', { hasText: crumble })).toContainText('Dessert');

    // A plain meal with no recipe works too, without clutter.
    await today.getByRole('button', { name: /Add a meal on/ }).click();
    await page.getByRole('searchbox', { name: 'Search recipes or type a meal' }).fill('Leftovers ' + tag);
    await page.getByRole('button', { name: /Add “Leftovers/ }).click();
    await expect(today.locator('.ml-entry', { hasText: 'Leftovers ' + tag })).toBeVisible();

    // Tap the ingredients you need.
    await today.locator('.ml-entry', { hasText: crumble }).click();
    const meal = page.getByRole('dialog', { name: crumble });
    await expect(meal.getByRole('button', { name: 'Tap what you need' })).toBeDisabled();
    await meal.getByRole('checkbox', { name: new RegExp(mango) }).click();
    await meal.getByRole('checkbox', { name: new RegExp(oats) }).click();
    await page.screenshot({ path: ART + '/meals-sheet-' + tag + '.png' });
    await meal.getByRole('button', { name: 'Add 2 to grocery list' }).click();
    await expect(meal.getByRole('status')).toContainText('Added 2');
    await expect(meal.getByRole('checkbox', { name: new RegExp(oats) })).toContainText('On list');
    await meal.getByRole('button', { name: 'Close' }).click();

    // Grocery: it is on the list with its quantity, check it off, finish the shop, and it is saved for next time.
    await page.getByRole('tab', { name: 'Grocery' }).click();
    const toBuy = page.getByRole('region', { name: 'To buy' });
    await expect(toBuy.getByRole('button', { name: new RegExp(oats) })).toContainText('1½ cups');
    await toBuy.getByRole('button', { name: new RegExp(oats) }).click();
    const cart = page.getByRole('region', { name: 'In the cart' });
    await expect(cart.getByRole('button', { name: new RegExp(oats) })).toBeVisible();
    await expect(toBuy.getByRole('button', { name: new RegExp(oats) })).toHaveCount(0);
    await page.screenshot({ path: ART + '/meals-grocery-' + tag + '.png' });
    await cart.getByRole('button', { name: 'Done shopping' }).click();
    await expect(cart).toHaveCount(0);

    const saved = page.getByRole('region', { name: 'Saved items' });
    await expect(saved.getByRole('button', { name: 'Add ' + oats + ' to the list' })).toBeVisible();
    await saved.getByRole('button', { name: 'Add ' + oats + ' to the list' }).click();
    await expect(toBuy.getByRole('button', { name: new RegExp(oats) })).toBeVisible();

    // Typing something already saved reuses it instead of making a duplicate.
    await page.getByLabel('Add item').fill(mango.toUpperCase());
    await page.getByRole('button', { name: /^On list$/ }).click();
    await expect(toBuy.getByRole('button', { name: new RegExp(mango, 'i') })).toHaveCount(1);

    // It all survives a reload.
    await page.reload();
    await expect(page.getByRole('region', { name: 'To buy' }).getByRole('button', { name: new RegExp(oats) })).toBeVisible();
    expect(errors.filter((e) => !/DevTools/.test(e))).toEqual([]);
  });
});
