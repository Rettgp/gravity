import { expect, test, type Page } from '@playwright/test';
import { addDays } from '@gravity/shared';
import { ART, isoToday, signIn, watchErrors } from './helpers';

const today = isoToday();
const saved = (page: Page) => expect(page.locator('.jr-status')).toContainText('Saved');
const cell = (page: Page, date: string) => page.locator('.jr-cal .jr-day[data-date="' + date + '"]');

test.describe('journal', () => {
  test('log meals + symptoms, see the coral unwell day, and it persists', async ({ page }, info) => {
    const errors = watchErrors(page);
    const who = info.project.name === 'mobile' ? 'teen' : 'mom';
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, who);
    await page.screenshot({ path: ART + '/dashboard-dark-' + info.project.name + '.png' });

    await page.getByRole('link', { name: /Add entry/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    await sheet.getByRole('combobox', { name: 'Add food to Breakfast' }).fill('Scrambled eggs');
    await sheet.getByRole('combobox', { name: 'Add food to Breakfast' }).press('Enter');
    await sheet.getByRole('combobox', { name: 'Add food to Dinner' }).fill('Pizza');
    await sheet.getByRole('combobox', { name: 'Add food to Dinner' }).press('Enter');
    await expect(sheet.locator('.jr-food', { hasText: 'Scrambled eggs' })).toBeVisible();

    await sheet.getByRole('switch', { name: 'Felt unwell today' }).click();
    await sheet.getByRole('button', { name: 'Nausea', exact: true }).click();
    await sheet.getByRole('radio', { name: 'Severity 4' }).first().click();
    await sheet.getByLabel('Notes').fill('Felt off after dinner');
    await saved(page);
    await page.screenshot({ path: ART + '/daysheet-dark-' + info.project.name + '.png' });

    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    await expect(cell(page, today)).toHaveAttribute('data-unwell', 'true');
    await page.screenshot({ path: ART + '/calendar-dark-' + info.project.name + '.png' });

    // Persisted server-side: survives a reload.
    await page.reload();
    await expect(cell(page, today)).toHaveAttribute('data-unwell', 'true');
    // The URL still carries ?date=, so the sheet reopens on today with the saved data.
    await expect(page.getByRole('dialog').locator('.jr-food', { hasText: 'Scrambled eggs' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Nausea', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // "Unwell days only" dims everything else.
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Unwell days only' }).click();
    await expect(cell(page, today)).not.toHaveClass(/is-dim/);
    expect(await page.locator('.jr-cal .jr-day.is-dim').count()).toBeGreaterThan(10);
    expect(errors.filter((e) => !/DevTools/.test(e))).toEqual([]);
  });

  test('turning unwell off clears the coral marker', async ({ page }, info) => {
    const who = info.project.name === 'mobile' ? 'teen' : 'mom';
    const date = addDays(today, info.project.name === 'mobile' ? -4 : -3);
    await signIn(page, who);
    await page.goto('/app/journal?date=' + date);
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('switch', { name: 'Felt unwell today' }).click();
    await saved(page);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(cell(page, date)).toHaveAttribute('data-unwell', 'true');
    // Toggle off and close immediately, inside the autosave debounce: the edit must still be flushed.
    await cell(page, date).click();
    await sheet.getByRole('switch', { name: 'Felt unwell today' }).click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(cell(page, date)).toHaveAttribute('data-unwell', 'false');
  });

  test('insights surface likely trigger foods from demo data', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    await signIn(page, 'dad');
    await page.getByRole('button', { name: 'Load demo data' }).click();
    await expect(page.getByRole('button', { name: 'Demo data loaded' })).toBeVisible();
    await page.getByRole('link', { name: 'Journal', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Insights' }).click();
    await expect(page.getByRole('heading', { name: 'Possible triggers' })).toBeVisible();
    const suspects = page.locator('.jr-suspect');
    await expect(suspects.first()).toBeVisible();
    await expect(page.locator('.jr-suspects').first()).toContainText(/pizza|ice cream/i);
    await suspects.first().click();
    await expect(page.locator('.jr-dates li').first()).toBeVisible();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: ART + '/insights-dark-' + info.project.name + '.png' });
  });

  test('sharing: a shared day is visible (read-only) to family, private ones are not', async ({ page, browser, request }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    const date = addDays(today, -6);
    await signIn(page, 'mom');
    await page.goto('/app/journal?date=' + date);
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('switch', { name: 'Felt unwell today' }).click();
    await sheet.getByRole('switch', { name: /Private to you/ }).click();
    await expect(sheet.getByText('Visible to family')).toBeVisible();
    await saved(page);

    const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
    const teen = await ctx.newPage();
    await signIn(teen, 'teen');
    await teen.getByRole('link', { name: 'Journal', exact: true }).first().click();
    // The feed shows the calendar's month; early in a month the shared day is in the previous one.
    if (date.slice(0, 7) !== today.slice(0, 7)) await teen.getByRole('button', { name: 'Previous month' }).click();
    await teen.getByRole('tab', { name: 'Family' }).click();
    const row = teen.locator('.jr-feed-row', { hasText: date });
    await expect(row).toContainText('Felt unwell');
    await row.click();
    const ro = teen.getByRole('dialog');
    await expect(ro).toContainText('view only');
    await expect(ro.getByRole('switch', { name: 'Felt unwell today' })).toBeDisabled();
    await expect(ro.getByRole('combobox', { name: 'Add food to Dinner' })).toHaveCount(0);
    await teen.screenshot({ path: ART + '/shared-readonly-' + info.project.name + '.png' });
    await ctx.close();

    // Dad's demo data was never shared, so teen sees nothing of it via the API either.
    const dadMe = await (await request.get('/api/core/me', { headers: { 'x-dev-user': 'dad@gravity.local' } })).json();
    const month = date.slice(0, 7);
    const leak = await request.get('/api/journal/profiles/' + dadMe.defaultProfileId + '/days?month=' + month, { headers: { 'x-dev-user': 'teen@gravity.local' } });
    expect(await leak.json()).toEqual([]);
  });

  test('managed profile: add a child, log for them, other adults cannot', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    await signIn(page, 'mom');
    await page.getByRole('link', { name: 'Family', exact: true }).first().click();
    await page.getByLabel('Name').fill('Junior');
    await page.getByRole('button', { name: 'Add profile' }).click();
    await expect(page.locator('article[data-profile="Junior"]')).toBeVisible();
    await page.screenshot({ path: ART + '/profiles-' + info.project.name + '.png' });

    await page.getByRole('link', { name: 'Journal', exact: true }).first().click();
    await page.getByRole('button', { name: /Junior/ }).click();
    await cell(page, today).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('combobox', { name: 'Add food to Lunch' }).fill('Grilled cheese');
    await sheet.getByRole('combobox', { name: 'Add food to Lunch' }).press('Enter');
    await saved(page);

    const profiles = await (await request.get('/api/core/profiles', { headers: { 'x-dev-user': 'mom@gravity.local' } })).json();
    const junior = profiles.find((p: { name: string }) => p.name === 'Junior');
    const res = await request.get('/api/journal/profiles/' + junior.id + '/days/' + today, { headers: { 'x-dev-user': 'teen@gravity.local' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('glimmers', () => {
  // A real (tiny) PNG: the app decodes and recompresses it in the browser before upload.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  test('add one with a photo, see it sparkle on the calendar and shine on the dashboard; family sees it view-only', async ({ page, browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    const errors = watchErrors(page);
    const date = addDays(today, -1);
    await signIn(page, 'mom');
    await page.goto('/app/journal?date=' + date);
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Glimmer photo').setInputFiles({ name: 'walk.png', mimeType: 'image/png', buffer: PNG });
    await expect(sheet.locator('.gl-preview img')).toBeVisible();
    await sheet.getByLabel('Glimmer caption').fill('Golden hour walk with the dog');
    await sheet.getByRole('button', { name: 'Add glimmer' }).click();
    await expect(sheet.getByRole('button', { name: /Open glimmer: Golden hour walk/ })).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(cell(page, date)).toHaveAttribute('data-glimmer', 'true');
    await expect(cell(page, date)).toHaveAttribute('aria-label', /has a glimmer/);
    await page.screenshot({ path: ART + '/glimmer-calendar-' + info.project.name + '.png' });

    await page.getByRole('link', { name: 'Home', exact: true }).first().click();
    const card = page.getByRole('region', { name: 'Glimmers' });
    await expect(card.getByRole('button', { name: /Golden hour walk/ })).toBeVisible();
    await expect(card.locator('img.gl-pic')).toBeVisible();
    await page.screenshot({ path: ART + '/glimmer-dashboard-' + info.project.name + '.png' });
    await card.getByRole('button', { name: /Golden hour walk/ }).click();
    await expect(page.getByRole('dialog', { name: 'Glimmer' }).locator('img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Glimmer' })).toHaveCount(0);

    // A family member sees it on the dashboard and on mom's calendar, but cannot edit and never sees the day's meals.
    const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
    const dad = await ctx.newPage();
    await signIn(dad, 'dad');
    await expect(dad.getByRole('region', { name: 'Glimmers' }).getByRole('button', { name: /Golden hour walk/ })).toBeVisible();
    await dad.getByRole('link', { name: 'Journal', exact: true }).first().click();
    await dad.getByRole('button', { name: /Mom/ }).click();
    await expect(cell(dad, date)).toHaveAttribute('data-glimmer', 'true');
    await cell(dad, date).click();
    const ro = dad.getByRole('dialog');
    await expect(ro.getByRole('button', { name: /Open glimmer: Golden hour walk/ })).toBeVisible();
    await expect(ro.getByRole('button', { name: 'Add glimmer' })).toHaveCount(0);
    await expect(ro.getByRole('button', { name: 'Remove glimmer' })).toHaveCount(0);
    await expect(ro.getByRole('combobox', { name: /Add food/ })).toHaveCount(0);
    await dad.screenshot({ path: ART + '/glimmer-family-view-' + info.project.name + '.png' });
    await ctx.close();
    expect(errors.filter((e) => !/DevTools/.test(e))).toEqual([]);
  });
});

test.describe('glimmer photos', () => {
  test('a big photo is previewed, stays sharp, and can be swapped or removed (phone and desktop)', async ({ page }, info) => {
    const sharp = (await import('sharp')).default;
    // Random noise barely compresses, so this is the worst case for the size budget.
    const noise = (w: number, h: number) => sharp(Buffer.from(Array.from({ length: w * h * 3 }, () => Math.floor(Math.random() * 256))), { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const big = await noise(3000, 2000);
    const small = await noise(600, 400);
    const who = info.project.name === 'mobile' ? 'teen' : 'mom';
    const date = addDays(today, info.project.name === 'mobile' ? -9 : -8);
    await signIn(page, who);
    await page.goto('/app/journal?date=' + date);
    const sheet = page.getByRole('dialog');
    const input = sheet.getByLabel('Glimmer photo');

    await input.setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: small });
    const preview = sheet.locator('.gl-preview img');
    await expect(preview).toBeVisible();
    const first = await preview.getAttribute('src');
    // Picking another photo replaces the preview.
    await input.setInputFiles({ name: 'b.jpg', mimeType: 'image/jpeg', buffer: big });
    await expect(preview).toBeVisible();
    await expect.poll(async () => await preview.getAttribute('src')).not.toBe(first);
    await page.screenshot({ path: ART + '/glimmer-compose-' + info.project.name + '.png' });
    // The controls fit the screen and are finger-sized.
    for (const sel of ['.gl-photo', '.gl-remove']) {
      const box = await sheet.locator(sel).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    await expect(sheet.getByText('Change photo')).toHaveCount(0); // icon-only: no visible text
    // Remove clears it, and the same photo can be picked again afterwards.
    await sheet.getByRole('button', { name: 'Remove photo' }).click();
    await expect(preview).toHaveCount(0);
    await input.setInputFiles({ name: 'b.jpg', mimeType: 'image/jpeg', buffer: big });
    await expect(preview).toBeVisible();
    await sheet.getByLabel('Glimmer caption').fill('Big photo');
    await sheet.getByRole('button', { name: 'Add glimmer' }).click();

    // Open it full size: it must keep real resolution, not a postage stamp.
    await sheet.getByRole('button', { name: /Open glimmer: Big photo/ }).click();
    const full = page.getByRole('dialog', { name: 'Glimmer' }).locator('img');
    await expect(full).toBeVisible();
    await expect.poll(async () => await full.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThanOrEqual(1600);
  });
});

test.describe('food autocomplete', () => {
  test('search history, pick with the keyboard, add a new food, Escape only closes the list', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    const dad = { 'x-dev-user': 'dad@gravity.local' };
    await request.get('/api/core/me', { headers: dad });
    expect((await request.post('/api/dev/seed', { headers: dad })).status()).toBe(200);
    await signIn(page, 'dad');
    await page.goto('/app/journal?date=' + addDays(today, -2));
    const sheet = page.getByRole('dialog');
    const lunch = sheet.getByRole('combobox', { name: 'Add food to Lunch' });

    // Focus shows history; typing filters it.
    await lunch.click();
    await expect(sheet.getByRole('listbox', { name: /Lunch suggestions/ })).toBeVisible();
    await lunch.fill('pi');
    const pizza = sheet.getByRole('option', { name: /^pizza$/i });
    await expect(pizza).toBeVisible();
    await expect(sheet.getByRole('option', { name: /Add .pi./ })).toBeVisible(); // can also add exactly what was typed
    // The list must be fully visible, not clipped below the fold of the sheet.
    const box = await sheet.getByRole('listbox').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    await page.screenshot({ path: ART + '/autocomplete-open-' + info.project.name + '.png' });

    // Keyboard: ArrowDown highlights, Enter adds; input clears and the food is a list row, not a pill.
    await lunch.press('ArrowDown');
    await expect(pizza).toHaveAttribute('aria-selected', 'true');
    await lunch.press('Enter');
    const lunchSection = sheet.getByRole('region', { name: 'Lunch' });
    await expect(lunchSection.locator('.jr-food', { hasText: 'pizza' })).toBeVisible();
    await expect(lunch).toHaveValue('');

    // Already-added foods are not offered again in the same meal.
    await lunch.fill('pizza');
    await expect(sheet.getByRole('option', { name: /^pizza$/i })).toHaveCount(0);

    // A brand-new food can be added from the list.
    await lunch.fill('dragonfruit smoothie');
    await sheet.getByRole('option', { name: /Add .dragonfruit smoothie./ }).click();
    await expect(lunchSection.locator('.jr-food', { hasText: 'dragonfruit smoothie' })).toBeVisible();
    await saved(page);

    // Escape closes the open list first; the day sheet stays.
    await lunch.click();
    await lunch.fill('o');
    await expect(sheet.getByRole('listbox')).toBeVisible();
    await lunch.press('Escape');
    await expect(sheet.getByRole('listbox')).toHaveCount(0);
    await expect(sheet).toBeVisible();

    // Newly added food now appears in history for other meals.
    await sheet.getByRole('combobox', { name: 'Add food to Snacks' }).fill('dragon');
    await expect(sheet.getByRole('option', { name: /^dragonfruit smoothie$/i })).toBeVisible();
    await page.screenshot({ path: ART + '/autocomplete-history-' + info.project.name + '.png' });
  });
});

test.describe('fixing typos', () => {
  test('edit a food in place, and remove a typo from history everywhere', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    const d1 = addDays(today, -8);
    const d2 = addDays(today, -9);
    await signIn(page, 'mom');
    const add = async (date: string, food: string) => {
      await page.goto('/app/journal?date=' + date);
      const sheet = page.getByRole('dialog');
      await sheet.getByRole('combobox', { name: 'Add food to Breakfast' }).fill(food);
      await sheet.getByRole('combobox', { name: 'Add food to Breakfast' }).press('Enter');
      await saved(page);
    };
    await add(d1, 'Bannana');
    await add(d2, 'Bannana');

    // 1) Fix the text in place on one day.
    await page.goto('/app/journal?date=' + d1);
    const sheet = page.getByRole('dialog');
    const breakfast = sheet.getByRole('region', { name: 'Breakfast' });
    await breakfast.getByRole('button', { name: 'Edit Bannana' }).click();
    const edit = breakfast.getByRole('textbox', { name: 'Edit Bannana' });
    await edit.fill('Banana');
    await edit.press('Enter');
    await expect(breakfast.locator('.jr-food', { hasText: 'Banana' })).toBeVisible();
    await saved(page);
    await page.reload();
    await expect(page.getByRole('dialog').getByRole('region', { name: 'Breakfast' }).locator('.jr-food')).toHaveText('Banana');

    // 2) The typo still lives on the other day and in suggestions: remove it from history everywhere.
    await page.goto('/app/journal?date=' + d2);
    const s2 = page.getByRole('dialog');
    await expect(s2.getByRole('region', { name: 'Breakfast' }).locator('.jr-food', { hasText: 'Bannana' })).toBeVisible();
    const lunch = s2.getByRole('combobox', { name: 'Add food to Lunch' });
    await lunch.fill('bann');
    await expect(s2.getByRole('option', { name: /bannana/i })).toBeVisible();
    await expect(s2.getByRole('option', { name: /^banana$/i })).toHaveCount(0); // 'bann' does not match the corrected spelling
    page.on('dialog', () => {
      throw new Error('a native browser dialog appeared; use the in-app ConfirmDialog');
    });
    await s2.getByRole('button', { name: 'Remove bannana from history' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Remove “bannana” everywhere?');
    await page.screenshot({ path: ART + '/confirm-dialog-' + info.project.name + '.png' });
    await confirm.getByRole('button', { name: 'Remove everywhere' }).click();
    await expect(confirm).toBeHidden();
    await expect(s2.getByRole('region', { name: 'Breakfast' }).locator('.jr-food', { hasText: 'Bannana' })).toHaveCount(0);
    await lunch.fill('bann');
    await expect(s2.getByRole('option', { name: /bannana/i })).toHaveCount(0);
    await page.screenshot({ path: ART + '/typo-fixed-' + info.project.name + '.png' });
  });
});

test.describe('confirm dialog', () => {
  const setup = async (page: import('@playwright/test').Page, date: string) => {
    await signIn(page, 'mom');
    await page.goto('/app/journal?date=' + date);
    const sheet = page.getByRole('dialog');
    const box = sheet.getByRole('combobox', { name: 'Add food to Breakfast' });
    await box.fill('Kiwii');
    await box.press('Enter');
    await saved(page);
    await sheet.getByRole('combobox', { name: 'Add food to Lunch' }).fill('kiw');
    await sheet.getByRole('button', { name: 'Remove kiwii from history' }).click();
    return sheet;
  };

  test('Cancel and Esc keep everything; Esc only closes the dialog, not the sheet', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    const sheet = await setup(page, addDays(today, -10));
    const dlg = page.getByRole('alertdialog');
    await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeFocused(); // safe default focus
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('region', { name: 'Breakfast' }).locator('.jr-food', { hasText: 'Kiwii' })).toBeVisible();
    await sheet.getByRole('combobox', { name: 'Add food to Lunch' }).fill('kiw');
    await sheet.getByRole('button', { name: 'Remove kiwii from history' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(sheet.getByRole('region', { name: 'Breakfast' }).locator('.jr-food', { hasText: 'Kiwii' })).toBeVisible();
  });

  test('a failing request shows an error inside the dialog instead of failing silently', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    await page.route('**/foods/remove', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Server hiccup"}' }));
    await setup(page, addDays(today, -11));
    const dlg = page.getByRole('alertdialog');
    await dlg.getByRole('button', { name: 'Remove everywhere' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Server hiccup');
    await expect(dlg.getByRole('button', { name: 'Remove everywhere' })).toBeEnabled(); // can retry
    await page.screenshot({ path: ART + '/confirm-dialog-error.png' });
    await dlg.getByRole('button', { name: 'Cancel' }).click();
  });
});

test.describe('medicine cabinet', () => {
  test('add a medicine, take it with a dose, see it outside the cabinet, undo and delete', async ({ page }, info) => {
    const errors = watchErrors(page);
    const who = info.project.name === 'mobile' ? 'teen' : 'mom';
    const name = 'Ibuprofen ' + info.project.name;
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, who);
    await page.goto('/app/journal?date=' + today);
    const sheet = page.getByRole('dialog', { name: /^Journal for/ });
    await sheet.getByRole('button', { name: 'Open medicine cabinet' }).click();

    const cab = page.getByRole('dialog', { name: 'Medicine cabinet' });
    await cab.getByRole('textbox', { name: 'Add medication' }).fill(name);
    await cab.getByRole('textbox', { name: 'Add medication' }).press('Enter');
    const pill = cab.getByRole('button', { name: new RegExp(name, 'i'), pressed: false });
    await pill.click();
    await expect(cab.getByRole('group', { name: 'Dose of ' + name })).toContainText('1');
    await cab.getByRole('button', { name: 'Increase dose of ' + name }).click();
    await expect(cab.getByRole('group', { name: 'Dose of ' + name })).toContainText('1.5');
    await page.screenshot({ path: ART + '/cabinet-dark-' + info.project.name + '.png' });
    await cab.getByRole('button', { name: 'Close medicine cabinet' }).click();
    await expect(cab).toBeHidden();

    // Taken medicines show in the day sheet itself, with dose and time.
    const taken = sheet.locator('.md-taken-pill', { hasText: name });
    await expect(taken).toContainText('1.5');
    await expect(taken).toContainText(/\d{1,2}:\d{2}(am|pm)/);
    await saved(page);
    await page.screenshot({ path: ART + '/medicine-dark-' + info.project.name + '.png' });
    await page.reload();
    await expect(page.getByRole('dialog', { name: /^Journal for/ }).locator('.md-taken-pill', { hasText: name })).toContainText('1.5');

    // Tap again to deselect, then remove it from the cabinet.
    await page.getByRole('dialog', { name: /^Journal for/ }).getByRole('button', { name: 'Open medicine cabinet' }).last().click();
    await cab.getByRole('button', { name: new RegExp(name, 'i'), pressed: true }).click();
    await cab.getByRole('button', { name: 'Edit cabinet' }).click();
    await cab.getByRole('button', { name: 'Remove ' + name + ' from the cabinet' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(cab.getByText(name)).toHaveCount(0);
    await cab.getByRole('button', { name: 'Close medicine cabinet' }).click();
    await expect(page.locator('.md-taken-pill', { hasText: name })).toHaveCount(0);
    expect(errors.filter((e) => !/DevTools/.test(e))).toEqual([]);
  });

  test('the Medicine tile on the dashboard opens the cabinet on today', async ({ page }) => {
    await signIn(page, 'dad');
    await page.getByRole('link', { name: /Medicine/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Medicine cabinet' })).toBeVisible();
    // It opens only that once: reopening today from the calendar must not pop the cabinet again.
    await page.getByRole('button', { name: 'Close medicine cabinet' }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await cell(page, today).click();
    await expect(page.getByRole('dialog', { name: /^Journal for/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Medicine cabinet' })).toHaveCount(0);
  });
});

test.describe('edit a taken medicine', () => {
  test('press and hold opens the editor to change dose and time, and it persists', async ({ page }, info) => {
    const who = info.project.name === 'mobile' ? 'teen' : 'mom';
    const name = 'Holdtest ' + info.project.name;
    await signIn(page, who);
    await page.goto('/app/journal?date=' + today);
    const sheet = page.getByRole('dialog', { name: /^Journal for/ });
    await sheet.getByRole('button', { name: 'Open medicine cabinet' }).click();
    const cab = page.getByRole('dialog', { name: 'Medicine cabinet' });
    await cab.getByRole('textbox', { name: 'Add medication' }).fill(name);
    await cab.getByRole('textbox', { name: 'Add medication' }).press('Enter');
    await cab.getByRole('button', { name: new RegExp(name, 'i'), pressed: false }).click();
    await cab.getByRole('button', { name: 'Close medicine cabinet' }).click();

    // A quick tap still opens the cabinet; a long press opens the editor instead.
    const pill = sheet.locator('.md-taken-pill', { hasText: name });
    await pill.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400); // let the sheet and list settle so the press lands on the pill
    const box = (await pill.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    const edit = page.getByRole('dialog', { name: 'Edit ' + name });
    await expect(edit).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Medicine cabinet' })).toHaveCount(0);
    await edit.getByRole('button', { name: 'Increase dose of ' + name }).click();
    await edit.getByRole('button', { name: 'Increase dose of ' + name }).click();
    await edit.getByLabel('Time taken').click();
    await page.keyboard.type('645');
    await expect(edit).toContainText('Shown as 6:45');
    await edit.getByRole('radio', { name: 'PM' }).click();
    await expect(edit).toContainText('Shown as 6:45pm');
    await edit.getByRole('radio', { name: 'AM' }).click();
    await page.screenshot({ path: ART + '/mededit-' + info.project.name + '.png' });
    await edit.getByRole('button', { name: 'Done' }).click();
    await expect(pill).toContainText('2');
    await expect(pill).toContainText('6:45am');
    await saved(page);
    await page.reload();
    await expect(page.getByRole('dialog', { name: /^Journal for/ }).locator('.md-taken-pill', { hasText: name })).toContainText('6:45am');

    // Remove from the editor.
    const again = page.getByRole('dialog', { name: /^Journal for/ }).locator('.md-taken-pill', { hasText: name });
    await again.scrollIntoViewIfNeeded();
    const b2 = (await again.boundingBox())!;
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Edit ' + name }).getByRole('button', { name: 'Remove' }).click();
    await expect(again).toHaveCount(0);
  });
});
