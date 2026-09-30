import { expect, test } from '@playwright/test';
import { ART, signIn, watchErrors } from './helpers';

test.describe('body numbers in the journal', () => {
  test('demo data shows the heads-up, the body strip and body signals', async ({ page }, info) => {
    const errors = watchErrors(page);
    // Dad's journal already gets the same demo seed in journal.spec, so seeding it here (twice, once per project) is safe.
    // Never use someone whose day-by-day state other specs depend on: seeded history would change their results.
    const who = 'dad';
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, who);

    await page.getByRole('button', { name: 'Load demo data' }).click();
    await expect(page.getByRole('button', { name: 'Demo data loaded' })).toBeVisible();

    // The early heads-up appears (today is seeded to look off), and links to logging.
    await page.reload();
    const headsUp = page.getByRole('status', { name: 'Early heads-up' });
    await expect(headsUp).toBeVisible();
    await expect(headsUp).toContainText('above your usual');
    await expect(headsUp).toContainText('not medical advice');
    await page.screenshot({ path: ART + '/headsup-dark-' + info.project.name + '.png', fullPage: true });
    await headsUp.getByRole('link', { name: 'Log how you feel' }).click();

    // Day sheet: the body strip is right there, read-only.
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const strip = sheet.getByRole('region', { name: 'Body numbers for this day' });
    await expect(strip).toContainText('Resting HR');
    await expect(strip).toContainText('Last night');
    await page.screenshot({ path: ART + '/bodystrip-dark-' + info.project.name + '.png' });
    await sheet.getByRole('button', { name: 'Close' }).click();

    // Insights: body signals compare unwell days with the rest.
    await page.getByRole('tab', { name: 'Insights' }).click();
    const card = page.getByRole('region', { name: 'Body signals' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('on unwell days');
    await expect(card).toContainText('Resting heart rate');
    await page.screenshot({ path: ART + '/bodysignals-dark-' + info.project.name + '.png', fullPage: true });

    expect(errors).toEqual([]);
  });
});
