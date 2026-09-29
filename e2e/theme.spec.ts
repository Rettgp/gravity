import { expect, test } from '@playwright/test';
import { ART, signIn } from './helpers';

test('theme toggle switches light/dark, persists, and both look right', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, info.project.name === 'mobile' ? 'teen' : 'dad');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe('rgb(246, 249, 252)');
  await page.screenshot({ path: ART + '/dashboard-light-' + info.project.name + '.png' });

  await page.goto('/app/journal');
  await page.screenshot({ path: ART + '/calendar-light-' + info.project.name + '.png' });

  const toggle = page.getByRole('button', { name: 'Switch to dark mode' });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).toBe('rgb(7, 11, 20)');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // persisted, no flash
  }
});

test('no horizontal overflow across app pages', async ({ page }, info) => {
  await signIn(page, info.project.name === 'mobile' ? 'teen' : 'dad');
  for (const path of ['/app', '/app/journal', '/app/profiles']) {
    await page.goto(path);
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, path).toBeLessThanOrEqual(1);
  }
});

test('appearance: System follows the device live, explicit choices override it, sign-out works on phones', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, info.project.name === 'mobile' ? 'teen' : 'dad');
  await page.getByRole('link', { name: 'Family', exact: true }).first().click();
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const theme = page.getByRole('radiogroup', { name: 'Theme' });

  // Default is System: no explicit attribute, and it tracks the device without a reload.
  await expect(theme.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  expect(await bg()).toBe('rgb(246, 249, 252)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(bg).toBe('rgb(7, 11, 20)');
  await page.screenshot({ path: ART + '/appearance-system-dark-' + info.project.name + '.png' });

  // Explicit Light wins over a dark device.
  await theme.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe('rgb(246, 249, 252)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // persisted

  // Back to System removes the override.
  await theme.getByRole('radio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  expect(await bg()).toBe('rgb(7, 11, 20)');

  // Sign out is reachable without the desktop nav.
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

// Regression: after Google sign-in the app lands on /auth/callback. It used to stay on that placeholder (a blank
// dark screen) because the URL was rewritten behind the router's back. It must always hand off to /app or /.
test('the auth callback route never leaves a blank screen', async ({ page }, info) => {
  await page.goto('/auth/callback');
  await expect(page).toHaveURL(/\/$/); // anonymous: back to the landing page
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await signIn(page, info.project.name === 'mobile' ? 'teen' : 'dad');
  await page.goto('/auth/callback?code=abc&state=xyz');
  await expect(page).toHaveURL(/\/app$/); // signed in: on to the dashboard, code removed from the URL
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
