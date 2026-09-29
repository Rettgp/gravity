import { expect, type Page } from '@playwright/test';

export const ART = 'e2e-artifacts';

export async function signIn(page: Page, who: 'mom' | 'dad' | 'teen') {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as ' + who + '@gravity.local' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export async function signOutViaStorage(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

/** Collects console errors and failed same-origin requests so tests can assert the app is clean. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export const isoToday = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};
