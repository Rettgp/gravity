import { expect, test } from '@playwright/test';
import { ART, signIn, watchErrors } from './helpers';

// Local mode swaps Google for a fake that bounces straight back to the app, so this exercises the real UI + API flow.
test.describe('health', () => {
  test('connect, see trends, and disconnect deletes everything', async ({ page }, info) => {
    const errors = watchErrors(page);
    // Each project signs in as a different person so the two runs never share a connection.
    const who = info.project.name === 'mobile' ? 'dad' : 'mom';
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, who);

    await page.getByRole('link', { name: 'Health' }).first().click();
    await expect(page).toHaveURL(/\/app\/health$/);
    await expect(page.getByRole('heading', { name: /health data/ })).toBeVisible();
    await expect(page.getByText('has not verified this app')).toBeVisible();

    await page.getByRole('button', { name: 'Connect Google Health' }).click();
    // Round trip through the callback route, then straight into the first import.
    await expect(page.getByText('Google Health connected')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/health\?connected=/);
    const trends = page.getByRole('list', { name: 'Trends' });
    await expect(trends.getByRole('heading', { name: 'Resting heart rate' })).toBeVisible();
    await expect(trends.getByRole('heading', { name: 'Sleep' })).toBeVisible();
    await expect(trends.getByRole('img', { name: /Resting heart rate, last 30 days/ })).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeHidden({ timeout: 20_000 }); // history import finishes
    await expect(page.getByText(/Last synced/)).toBeVisible();
    await page.screenshot({ path: ART + '/health-dark-' + info.project.name + '.png', fullPage: true });

    // The accessible table view has the same numbers.
    await page.getByText('Show the last two weeks as a table').click();
    await expect(page.getByRole('row', { name: /^Today/ })).toBeVisible();

    // Survives a reload (data is server-side, not in the page).
    await page.reload();
    await expect(trends.getByRole('heading', { name: 'Steps' })).toBeVisible();

    // Disconnect asks first, then removes the connection and all imported numbers.
    await page.getByRole('button', { name: 'Disconnect' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('deletes every health number');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Google Health connected')).toBeVisible();
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Disconnect and delete' }).click();
    await expect(page.getByRole('button', { name: 'Connect Google Health' })).toBeVisible();
    await expect(trends).toBeHidden();

    expect(errors).toEqual([]);
  });

  test('a declined Google consent shows a clear message and connects nothing', async ({ page }) => {
    await signIn(page, 'teen');
    await page.goto('/app/health/callback?error=access_denied');
    await expect(page.getByRole('heading', { name: 'Not connected' })).toBeVisible();
    await expect(page.getByText('You cancelled the connection')).toBeVisible();
    await page.getByRole('link', { name: 'Back to Health' }).click();
    await expect(page.getByRole('button', { name: 'Connect Google Health' })).toBeVisible();
  });

  test('a stale or forged return link is rejected without connecting', async ({ page }) => {
    await signIn(page, 'teen');
    await page.goto('/app/health/callback?code=x&state=not-a-real-state');
    await expect(page.getByRole('alert')).toContainText('expired');
  });
});
