import { expect, test } from '@playwright/test';
import { ART, watchErrors } from './helpers';

test.describe('landing', () => {
  test('renders hero, glass nav, and a live demo with unwell days', async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Everything your family keeps track of');
    await expect(page.getByRole('button', { name: /Sign in with Google/ })).toBeVisible();
    await page.waitForTimeout(1200); // let the staged entrance finish
    await page.screenshot({ path: ART + '/landing-hero-dark-' + info.project.name + '.png' });

    // Nav is a floating pill, not a full-width band.
    const nav = await page.locator('.land-nav').boundingBox();
    const vw = page.viewportSize()!.width;
    expect(nav!.width).toBeLessThan(vw - 24);
    expect(nav!.x).toBeGreaterThan(8);
    const glass = await page.locator('.land-nav').evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(glass).toContain('blur');

    // Scroll to the showcase; the demo frame mounts the real Journal on seeded data.
    await page.locator('#see-it').scrollIntoViewIfNeeded();
    const unwell = page.locator('.frame .jr-day[data-unwell="true"]');
    await expect(unwell.first()).toBeVisible();
    expect(await unwell.count()).toBeGreaterThan(2);
    await page.waitForTimeout(900);
    await page.screenshot({ path: ART + '/landing-demo-dark-' + info.project.name + '.png' });

    // The demo is interactive: open another day and toggle unwell without touching any API.
    const requests: string[] = [];
    page.on('request', (r) => r.url().includes('/api/') && requests.push(r.url()));
    await page.locator('.frame .jr-day[data-unwell="false"]').first().click();
    await expect(page.locator('.frame .jr-sheet')).toBeVisible();
    expect(requests).toEqual([]);
    expect(errors.filter((e) => !/favicon|Download the React DevTools/.test(e))).toEqual([]);
  });

  test('no horizontal overflow and works in light mode', async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: ART + '/landing-hero-light-' + info.project.name + '.png' });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(246, 249, 252)');
  });

  test('reduced motion stops the orbit animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const name = await page.locator('.orb-wrap').first().evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
  });

  test('sign in leads to the local login (dev) and never exposes app routes', async ({ page }) => {
    await page.goto('/app/journal');
    await expect(page).toHaveURL(/\/$/); // anon users are bounced to the landing page
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Continue as mom@gravity.local' })).toBeVisible();
  });
});
