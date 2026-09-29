import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Regression: the API rejected a signed-in user (unverified email), the client treated the 401 as an expired
// session, signed out, and bounced back to login on every attempt. It must explain the problem and stay put.
test.describe('when the API rejects a signed-in user', () => {
  for (const status of [401, 403]) {
    test('HTTP ' + status + ' shows an access message instead of looping back to login', async ({ page }, info) => {
      await page.route('**/api/core/me', (r) =>
        r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: status === 403 ? 'Not a member of this family' : 'Unauthorized' }) }),
      );
      await page.goto('/login');
      await page.getByRole('button', { name: 'Continue as ' + (info.project.name === 'mobile' ? 'teen' : 'dad') + '@gravity.local' }).click();

      await expect(page.getByRole('alert')).toContainText('We could not confirm your access');
      await page.waitForTimeout(1500); // a redirect loop would have fired by now
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

      // Recovery: once the server accepts the user, "Try again" gets into the app.
      await page.unroute('**/api/core/me');
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('link', { name: /Add entry/ })).toBeVisible();
    });
  }

  test('Sign out from the message returns to the landing page', async ({ page }, info) => {
    await page.route('**/api/core/me', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' }));
    await signInMaybe(page, info.project.name === 'mobile' ? 'teen' : 'dad');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

async function signInMaybe(page: import('@playwright/test').Page, who: 'dad' | 'teen') {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as ' + who + '@gravity.local' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
}
