import { expect, test } from '@playwright/test';
import { ART, signIn, watchErrors } from './helpers';

test.describe('health card detail view', () => {
  test('open a card for the big chart, stats and explanation; keyboard, ranges, sleep stages, Esc', async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    // Dad's journal gets the same demo seed in several specs, so this is safe. The test disconnects at the end so
    // health.spec (which starts from "not connected") is unaffected.
    await signIn(page, 'dad');
    await page.getByRole('button', { name: 'Load demo data' }).click();
    await expect(page.getByRole('button', { name: 'Demo data loaded' })).toBeVisible();
    await page.getByRole('link', { name: 'Health' }).first().click();
    await page.getByRole('button', { name: 'Connect Google Health' }).click();
    await expect(page.getByText('Google Health connected')).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeHidden({ timeout: 20_000 });

    // Clicking anywhere on the card opens it (not just the title button).
    const tile = page.locator('.hl-tile', { hasText: 'Resting heart rate' });
    await tile.locator('.hl-value').click();
    const dlg = page.getByRole('dialog', { name: 'Resting heart rate' });
    await expect(dlg).toBeVisible();

    // Big chart with the readout for the latest day, and the key for what is drawn.
    const chart = dlg.getByRole('group', { name: /^Resting heart rate, .* to / });
    await expect(chart).toBeVisible();
    await expect(dlg.getByRole('status').first()).toContainText('bpm');
    await expect(dlg.getByRole('list', { name: 'Chart key' })).toContainText('Your usual range');
    // Days logged as unwell in the journal are marked on the chart.
    await expect(dlg.getByRole('list', { name: 'Chart key' })).toContainText('Felt unwell');
    expect(await dlg.locator('.hl-band-unwell').count()).toBeGreaterThan(0);
    // Consecutive unwell days are merged into one band, so there are fewer bands than unwell days.
    expect(await dlg.locator('.hl-band-unwell').count()).toBeLessThan(13);

    // Stats, the unwell comparison, and the plain-language explanation.
    const stats = dlg.getByRole('list', { name: 'Summary' }).or(dlg.locator('dl[aria-label="Summary"]'));
    for (const label of ['Latest', '7-day average', '30-day average', 'Your usual', 'Lowest', 'Highest', 'Days with data']) await expect(stats).toContainText(label);
    await expect(dlg.getByText(/You logged \d+ unwell days/)).toBeVisible();
    await expect(dlg.getByRole('region', { name: 'About Resting heart rate' })).toContainText('not medical advice');
    await page.waitForTimeout(500); // let the open animation finish before the screenshot
    await page.screenshot({ path: ART + '/health-detail-dark-' + info.project.name + '.png' });

    // Arrow keys walk through days without a mouse; the readout follows.
    await chart.focus();
    const readout = dlg.getByRole('status').first();
    const before = await readout.innerText();
    await page.keyboard.press('ArrowLeft');
    await expect(readout).not.toHaveText(before);
    await page.keyboard.press('Home');
    await expect(readout).toContainText(/\w{3}, \w{3} \d+, \d{4}/);

    // Ranges rescope everything below.
    await dlg.getByRole('button', { name: '7 days' }).click();
    await expect(dlg.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(stats).toContainText('of 7');
    await dlg.getByRole('button', { name: 'Year' }).click();
    await expect(stats).toContainText('of 365');

    // Every value is also available as a table.
    await dlg.getByText('Show every value as a table').click();
    await expect(dlg.getByRole('row').nth(1)).toBeVisible();

    // Esc closes and hands focus back to the card's button.
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(tile.getByRole('button', { name: 'Open Resting heart rate details' })).toBeFocused();

    // Sleep gets a second chart: time asleep, plus stages per night with a legend.
    await page.locator('.hl-tile', { hasText: 'Sleep' }).getByRole('button', { name: 'Open Sleep details' }).click();
    const sleep = page.getByRole('dialog', { name: 'Sleep' });
    await expect(sleep).toBeVisible();
    await expect(sleep.getByRole('heading', { name: 'Sleep stages' })).toBeVisible();
    await expect(sleep.getByRole('list', { name: 'Sleep stage key' })).toContainText('Deep');
    await expect(sleep.getByRole('list', { name: 'Sleep stage key' })).toContainText('REM');
    await expect(sleep.getByRole('group', { name: /^Sleep stages per night/ })).toBeVisible();
    expect(await sleep.locator('.hl-stage').count()).toBeGreaterThan(20);
    await page.waitForTimeout(500);
    await sleep.evaluate((el) => el.scrollTo(0, 420));
    await page.screenshot({ path: ART + '/health-sleep-dark-' + info.project.name + '.png' });
    // Clicking the dark backdrop also closes it.
    await page.locator('.jr-scrim').click({ position: { x: 5, y: 5 } });
    await expect(sleep).toBeHidden();

    // Clean up so the next spec starts from "not connected".
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Disconnect and delete' }).click();
    await expect(page.getByRole('button', { name: 'Connect Google Health' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
