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

    await sheet.getByRole('textbox', { name: 'Add food to Breakfast' }).fill('Scrambled eggs');
    await sheet.getByRole('textbox', { name: 'Add food to Breakfast' }).press('Enter');
    await sheet.getByRole('textbox', { name: 'Add food to Dinner' }).fill('Pizza');
    await sheet.getByRole('textbox', { name: 'Add food to Dinner' }).press('Enter');
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
    await teen.getByRole('tab', { name: 'Family' }).click();
    const row = teen.locator('.jr-feed-row', { hasText: date });
    await expect(row).toContainText('Felt unwell');
    await row.click();
    const ro = teen.getByRole('dialog');
    await expect(ro).toContainText('view only');
    await expect(ro.getByRole('switch', { name: 'Felt unwell today' })).toBeDisabled();
    await expect(ro.getByRole('textbox', { name: 'Add food to Dinner' })).toHaveCount(0);
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
    await sheet.getByRole('textbox', { name: 'Add food to Lunch' }).fill('Grilled cheese');
    await sheet.getByRole('textbox', { name: 'Add food to Lunch' }).press('Enter');
    await saved(page);

    const profiles = await (await request.get('/api/core/profiles', { headers: { 'x-dev-user': 'mom@gravity.local' } })).json();
    const junior = profiles.find((p: { name: string }) => p.name === 'Junior');
    const res = await request.get('/api/journal/profiles/' + junior.id + '/days/' + today, { headers: { 'x-dev-user': 'teen@gravity.local' } });
    expect(res.status()).toBe(404);
  });
});
