import { expect, test } from '@playwright/test';
import { expectNoOverflow, goTo, signIn } from './helpers';

const ROUTES = ['/app', '/app/journal', '/app/meals', '/app/health', '/app/profiles', '/app/planner', '/app/trips'];
type Dest = [string, RegExp];

test('desktop: the sidebar reaches every destination', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await signIn(page, 'mom');
  const side = page.getByRole('navigation', { name: 'Primary' });
  const dests: Dest[] = [
    ['Journal', /\/app\/journal$/], ['Meals', /\/app\/meals(\?|$)/], ['Health', /\/app\/health$/], ['Planner', /\/app\/planner$/],
    ['Trips', /\/app\/trips$/], ['Family', /\/app\/profiles$/], ['Home', /\/app$/],
  ];
  for (const [name, url] of dests) {
    await goTo(page, name);
    await expect(page).toHaveURL(url);
    // Apps without pages stay on the app list and mark themselves; Family lives in the footer.
    if (!['Meals', 'Planner', 'Trips', 'Family'].includes(name)) await expect(side.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.locator('.topbar')).toBeHidden(); // the sidebar carries the account menu; no top bar
});

test('desktop: opening an app swaps the sidebar to its pages, and All apps goes back without leaving the page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await signIn(page, 'mom');
  const side = page.getByRole('navigation', { name: 'Primary' });
  const pages = page.getByRole('navigation', { name: 'Meals pages' });
  await side.getByRole('link', { name: 'Meals', exact: true }).click();
  await expect(side).toBeHidden();
  await expect(pages.getByRole('link').first()).toHaveAttribute('aria-current', 'page');
  // Every page has an icon.
  for (const link of await pages.getByRole('link').all()) await expect(link.locator('svg')).toHaveCount(1);
  const second = pages.getByRole('link').nth(1);
  await second.click();
  await expect(second).toHaveAttribute('aria-current', 'page');
  const url = page.url();
  await page.getByRole('button', { name: 'All apps' }).click();
  await expect(side).toBeVisible();
  expect(page.url()).toBe(url);
  await side.getByRole('link', { name: 'Journal', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/journal$/);
  await expect(side.getByRole('link', { name: 'Journal', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('mobile: Menu slides the sidebar in, picking a page closes it, Escape hands focus back', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout');
  await signIn(page, 'mom');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const side = page.getByRole('navigation', { name: 'Primary' });
  await expect(side).toBeHidden();
  await expect(page.locator('.tabbar')).toHaveCount(0); // no bottom bar
  expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await menu.click();
  for (const m of ['Home', 'Journal', 'Health', 'Meals', 'Planner', 'Trips', 'Medicine', 'Family']) {
    await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('link', { name: m, exact: true })).toBeVisible();
  }
  await side.getByRole('link', { name: 'Meals', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/meals(\?|$)/);
  await expect(side).toBeHidden();

  // Inside an app the drawer lists that app's pages.
  const pages = page.getByRole('navigation', { name: 'Meals pages' });
  await menu.click();
  await pages.getByRole('link', { name: 'Grocery' }).click();
  await expect(page).toHaveURL(/tab=grocery/);
  await expect(pages).toBeHidden();

  await menu.click();
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pages).toBeHidden();
  await expect(menu).toBeFocused();
  await expectNoOverflow(page);
});

test('theme menu: Light, Dark and System each persist across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, 'dad');
  const html = page.locator('html');
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  const pick = async (name: string) => {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitemradio', { name }).click();
    await expect(page.getByRole('menu')).toBeHidden();
  };

  await pick('Dark');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await bg()).toBe('#070b14');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await bg()).toBe('#070b14');

  await pick('Light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe('#f6f9fc');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe('#f6f9fc');

  await pick('System');
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(bg).toBe('#070b14');
  await page.reload();
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  expect(await bg()).toBe('#070b14');

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Family' }).click();
  await expect(page).toHaveURL(/\/app\/profiles$/);
});

for (const scheme of ['light', 'dark'] as const) {
  test('no horizontal overflow on any route (' + scheme + ')', async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, 'mom');
    for (const path of ROUTES) {
      await page.goto(path);
      await expect(page.locator('main.app-main')).toBeVisible();
      await page.waitForTimeout(400);
      await expectNoOverflow(page);
    }
  });
}
