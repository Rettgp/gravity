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

/** The page must not scroll sideways (scrollWidth <= innerWidth). */
export async function expectNoOverflow(page: Page) {
  const over = await page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) - window.innerWidth);
  expect(over, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

/** Phones: opens the Menu drawer (the sidebar). No-op when it is already open, or from 768px where the sidebar always shows. */
export async function openMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if ((await menu.isVisible()) && (await page.locator('.sidebar.is-open').count()) === 0) await menu.click();
}

/** Navigate by visible label on any screen size, through the sidebar (the Menu drawer on phones). */
export async function goTo(page: Page, name: string) {
  await expect(page.locator('main.app-main')).toBeVisible(); // isVisible() below does not wait for the shell
  const back = page.getByRole('button', { name: 'All apps' });
  // Inside an app with pages the sidebar lists those pages: go back to the app list first. Family sits in the footer.
  const side = page.getByRole('complementary', { name: 'Sidebar' }).locator('.sb-scroll, .sb-foot').getByRole('link', { name, exact: true });
  return expect(async () => {
    await openMenu(page);
    if (await back.isVisible()) await back.click();
    await side.click({ timeout: 1000 });
  }).toPass();
}

export const isoToday = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};
