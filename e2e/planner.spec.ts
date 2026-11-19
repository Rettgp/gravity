import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ART, expectNoOverflow, goTo, openMenu, signIn, watchErrors } from './helpers';

const P = '/app/planner';
const PAGES = [
  ...['dashboard', 'setup', 'todos', 'budget', 'gifts', 'cards', 'decorations', 'shopping', 'meals', 'traditions', 'travel'].map((p) => `${P}/christmas/${p}`),
  ...['budget', 'gifts', 'decorations', 'yes-day'].map((p) => `${P}/birthday/${p}`),
];

/** Opens a planner page from the sidebar (the Menu drawer on phones), which lists Christmas and Birthdays pages separately. */
async function go(page: Page, name: string, occasion: 'Christmas' | 'Birthdays' = 'Christmas') {
  await openMenu(page);
  await page.getByRole('navigation', { name: 'Planner pages' }).getByRole('list', { name: occasion }).getByRole('link', { name, exact: true }).click();
}
const occasion = (page: Page, name: 'Christmas' | 'Birthdays') => go(page, name === 'Birthdays' ? 'Gifts' : 'Dashboard', name);
const tool = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Planner tools' }).click();
  await page.getByRole('menuitem', { name }).click();
};
const addButton = (page: Page, name: RegExp) => page.getByRole('button', { name }).first();
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const filters = (page: Page) => page.getByRole('group', { name: 'Filter by tags' });

async function openChristmas(page: Page) {
  await goTo(page, 'Planner');
  await expect(page).toHaveURL(/\/app\/planner$/);
  await page.getByRole('link', { name: /Open Christmas/ }).click();
  await expect(page).toHaveURL(/\/planner\/christmas\/(setup|dashboard)$/);
}

test.describe('planner', () => {
  test.setTimeout(120_000);

  test('looks up photos again after the scraper improved: blanks and old Amazon picks, never other stores', async ({ page }) => {
    await signIn(page, 'dad');
    const link = 'https://a.co/d/retry-test';
    const wrongLink = 'https://a.co/d/wrong-photo';
    const keepLink = 'https://www.target.com/p/thing/-/A-1';
    const gifts = [
      { id: 'retry-gift', recipient: 'Nana', idea: 'Old lookup', link, image: '', imageFor: link },
      { id: 'wrong-gift', recipient: 'Nana', idea: 'Picked an ad', link: wrongLink, image: 'https://m.media-amazon.com/images/I/315PBUzfZiL.jpg', imageFor: wrongLink, imageTry: 2 },
      { id: 'keep-gift', recipient: 'Nana', idea: 'Other store', link: keepLink, image: 'https://target.scene7.com/is/image/Target/1', imageFor: keepLink },
    ];
    const ids = gifts.map((g) => g.id);
    await page.route(/\/api\/planner\/years\/\d{4}$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      if (!res.ok()) return route.fulfill({ response: res });
      const json = await res.json();
      json.collections = { ...json.collections, gifts: [...(json.collections?.gifts ?? []).filter((g: any) => !ids.includes(g.id)), ...gifts] };
      await route.fulfill({ response: res, json });
    });
    const lookups: string[] = [];
    await page.route('**/api/planner/link-image', (route) => {
      lookups.push(route.request().postDataJSON().url);
      const url = route.request().postDataJSON().url;
      return route.fulfill({ json: { image: url === link ? 'https://m.media-amazon.com/images/I/retry.jpg' : 'https://m.media-amazon.com/images/I/81right._AC_SL1500_.jpg' } });
    });
    // Answer the saves here so the shared test database never holds these gifts.
    await page.route(/\/items\/gifts\/(retry|wrong|keep)-gift$/, (route) => route.fulfill({ json: route.request().postDataJSON() }));
    const saved = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/items/gifts/retry-gift'));
    const fixed = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/items/gifts/wrong-gift'));
    await openChristmas(page);
    const welcome = page.getByRole('heading', { name: /set up your Christmas/ });
    await expect(welcome.or(page.locator('.planner-head'))).toBeVisible();
    if (await welcome.isVisible()) {
      await page.getByLabel('Your name or family name').fill('The Test Family');
      await page.getByRole('button', { name: 'Start planning' }).click();
    }
    await expect(page).toHaveURL(/christmas\/dashboard$/); // let the planner's own redirect land before navigating
    await go(page, 'Gifts');
    const body = (await saved).postDataJSON();
    expect(body).toMatchObject({ image: 'https://m.media-amazon.com/images/I/retry.jpg', imageFor: link, imageTry: 3 });
    expect((await fixed).postDataJSON()).toMatchObject({ image: 'https://m.media-amazon.com/images/I/81right._AC_SL1500_.jpg', imageTry: 3 });
    expect(lookups.sort()).toEqual([link, wrongLink].sort()); // the other store's photo is never looked up again
    // The photo spans the whole tile (a global img max-width once left a gap on the right).
    const tile = page.getByRole('button', { name: /Other store\. Tap to expand/ });
    const [t, img] = [await tile.boundingBox(), await tile.locator('.gt-img').boundingBox()];
    expect(Math.abs(t!.x + t!.width - (img!.x + img!.width))).toBeLessThan(3);
    expect(Math.abs(t!.x - img!.x)).toBeLessThan(3);
  });

  test('gifts, price tracker, budget, to-dos, birthdays, backup, years, print', async ({ page }, info) => {
    const errors = watchErrors(page);
    const tag = info.project.name;
    const mobile = tag === 'mobile';
    await signIn(page, mobile ? 'teen' : 'mom');

    // Chooser, then Christmas. The first project to run creates the year from Setup.
    await openChristmas(page);
    const welcome = page.getByRole('heading', { name: /set up your Christmas/ });
    await expect(welcome.or(page.locator('.planner-head'))).toBeVisible();
    if (await welcome.isVisible()) {
      await page.getByLabel('Your name or family name').fill('The Test Family');
      await page.getByRole('button', { name: 'Start planning' }).click();
    }
    await expect(page).toHaveURL(/christmas\/dashboard$/);
    await expect(page.getByText('All changes saved')).toBeVisible();

    // ---- Gifts: add, edit, filter, purchased, persisted ----
    await go(page, 'Gifts');
    const cardigan = 'Cardigan ' + tag;
    const book = 'Book ' + tag;
    for (const [who, idea] of [['Nana', cardigan], ['Pop', book]]) {
      await addButton(page, /Add gift/i).click();
      const form = dialog(page, 'New gift');
      await form.getByLabel('Recipient').fill(who!);
      await form.getByLabel('Gift idea').fill(idea!);
      await form.getByLabel('Cost').fill('30');
      await form.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(form).toBeHidden();
    }
    const tile = (idea: string) => page.getByRole('button', { name: new RegExp(idea + '\\. Tap to expand') });
    await expect(tile(cardigan)).toBeVisible();
    // Edit via the expanded tile.
    await tile(cardigan).click();
    await dialog(page, new RegExp(cardigan)).getByRole('button', { name: /Edit gift/ }).click();
    const edit = dialog(page, 'Edit gift');
    await expect(edit.getByLabel('Cost')).toHaveValue('30');
    await edit.getByLabel('Cost').fill('27.5');
    await edit.getByLabel('Store').fill('Corner shop');
    await page.screenshot({ path: ART + '/planner-edit-' + tag + '.png' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();
    // Mark purchased, then filter by it.
    await tile(cardigan).click();
    await dialog(page, new RegExp(cardigan)).getByRole('button', { name: /Purchased/ }).click();
    await page.keyboard.press('Escape');
    await filters(page).getByRole('button', { name: 'Purchased' }).click();
    await expect(tile(cardigan)).toBeVisible();
    await expect(tile(book)).toBeHidden();
    await filters(page).getByRole('button', { name: 'Clear' }).click();
    await expect(tile(book)).toBeVisible();
    await page.reload();
    await expect(tile(cardigan)).toBeVisible();
    await filters(page).getByRole('button', { name: 'Purchased' }).click();
    await expect(tile(cardigan)).toBeVisible();
    await expect(tile(book)).toBeHidden();
    await filters(page).getByRole('button', { name: 'Clear' }).click();
    await page.screenshot({ path: ART + '/planner-gifts-' + tag + '.png' });

    // ---- Price tracker against the local faked fetch ----
    const lamp = 'Lamp ' + tag;
    await addButton(page, /Add gift/i).click();
    const nf = dialog(page, 'New gift');
    await nf.getByLabel('Recipient').fill('Nana');
    await nf.getByLabel('Gift idea').fill(lamp);
    await nf.getByLabel('Link', { exact: true }).fill('https://shop.test/item?price=50');
    await nf.getByRole('button', { name: 'Add', exact: true }).click();
    await tile(lamp).click();
    const lampDlg = dialog(page, new RegExp(lamp));
    await lampDlg.getByRole('button', { name: /Track price/ }).click();
    await lampDlg.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(lampDlg.getByText('$50.00').first()).toBeVisible();
    await lampDlg.getByRole('button', { name: /Check now/ }).click();
    await expect(lampDlg.getByText(/Checked /)).toBeVisible();
    await expect(lampDlg.getByText('$50.00').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // ---- Budget: category, expense, totals ----
    await go(page, 'Budget');
    await addButton(page, /Add category/i).click();
    const cat = dialog(page, 'New budget category');
    await cat.getByLabel('Category name').fill('Food ' + tag);
    await cat.getByLabel('Planned budget').fill('500');
    await cat.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Food ' + tag)).toBeVisible();
    await page.getByRole('button', { name: /^Expenses/ }).click();
    await addButton(page, /Add expense/i).click();
    const exp = dialog(page, 'New expense');
    await exp.getByLabel('What was it?').fill('Turkey ' + tag);
    await exp.getByLabel('Amount').fill('120');
    await exp.getByLabel('Category').selectOption({ label: 'Food ' + tag });
    await exp.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Turkey ' + tag)).toBeVisible();
    await page.getByRole('button', { name: /^Categories/ }).click();
    await expect(page.getByText(/\$120/).first()).toBeVisible();
    await expect(page.getByText(/\$500/).first()).toBeVisible();
    await page.screenshot({ path: ART + '/planner-budget-' + tag + '.png' });

    // ---- To-dos: add and complete ----
    await go(page, 'To-Do');
    await addButton(page, /Add task/i).click();
    const todo = dialog(page, 'New task');
    await todo.getByLabel('Task').fill('Book photos ' + tag);
    await todo.getByRole('button', { name: 'Add', exact: true }).click();
    const done = page.getByRole('checkbox', { name: 'Mark Book photos ' + tag + ' done' });
    await done.click();
    await expect(done).toBeHidden(); // leaves the "To do" view
    await page.getByRole('button', { name: /^Done/ }).click();
    await expect(done).toHaveAttribute('aria-checked', 'true');

    // ---- Birthday: gift and Yes Day ----
    await occasion(page, 'Birthdays');
    await expect(page).toHaveURL(/birthday\/gifts$/);
    await addButton(page, /Add gift/i).click();
    const bg = dialog(page, 'New gift');
    await bg.getByLabel('Birthday of').selectOption('Marshall');
    await bg.getByLabel('Gift idea').fill('Lego ' + tag);
    await bg.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(tile('Lego ' + tag)).toBeVisible();
    await page.screenshot({ path: ART + '/planner-birthday-gifts-' + tag + '.png' });
    await go(page, 'Yes Day', 'Birthdays');
    const yes = page.locator('.yes-card', { hasText: 'Marshall' });
    await yes.getByPlaceholder('e.g. Pizza night').fill('Tacos ' + tag);
    await yes.getByPlaceholder('e.g. Pizza night').blur();
    await expect(yes.getByText(/1\/5 picked/)).toBeVisible();

    // ---- Backup export, then restore into a different year, then year switch ----
    await occasion(page, 'Christmas');
    const [download] = await Promise.all([page.waitForEvent('download'), tool(page, 'Backup')]);
    const file = info.outputPath('backup-' + tag + '.json');
    await download.saveAs(file);
    const backup = JSON.parse(readFileSync(file, 'utf8'));
    expect(JSON.stringify(backup)).toContain(cardigan);
    const restoreYear = mobile ? 2041 : 2040;
    backup.years = backup.years.slice(0, 1).map((y: { year: number }) => ({ ...y, year: restoreYear }));
    backup.years[0].settings.year = restoreYear;
    await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.getByRole('alertdialog', { name: 'Restore backup?' }).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();
    await expect(page.getByLabel('Christmas year')).toHaveValue(String(restoreYear));
    await go(page, 'Gifts');
    await expect(tile(cardigan)).toBeVisible();
    const years = await page.getByLabel('Christmas year').locator('option').allTextContents();
    const other = years.find((y) => /^\d{4}$/.test(y) && y !== String(restoreYear))!;
    await page.getByLabel('Christmas year').selectOption(other);
    await expect(page.getByLabel('Christmas year')).toHaveValue(other);
    await expect(tile(cardigan)).toBeVisible();

    // ---- Print route has no shell chrome ----
    await tool(page, 'PDF Export');
    await expect(page).toHaveURL(/christmas\/print$/);
    await expect(page.locator('.print-view')).toBeVisible();
    for (const sel of ['.topbar', '.sidebar', '.planner-head']) await expect(page.locator(sel)).toBeHidden();
    await page.getByRole('button', { name: /Back/ }).click();

    expect(errors.filter((e) => !/example\.test|pic\.png|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(e))).toEqual([]);
  });

  test('every planner page fits the screen in light and dark', async ({ page }) => {
    await signIn(page, 'dad');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(P);
      await expect(page.getByRole('link', { name: /Open Christmas/ })).toBeVisible();
      await expectNoOverflow(page);
      if (scheme === 'light') await page.screenshot({ path: ART + '/planner-chooser-' + scheme + '.png' });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('button', { name: 'Planner tools' })).toBeVisible();
        await expect(page.locator('.loading-state')).toHaveCount(0);
        await expectNoOverflow(page);
      }
      await page.goto(`${P}/christmas/print`);
      await expect(page.locator('.print-view')).toBeVisible();
      await expectNoOverflow(page);
    }
  });
});
