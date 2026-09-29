import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('nav logo is vertically centered in the pill', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'brand row only shows on desktop');
  await signIn(page, 'dad');
  const nav = await page.locator('.app-nav').boundingBox();
  const logo = await page.locator('.app-nav .wordmark img').boundingBox();
  const text = await page.locator('.app-nav .wordmark span').boundingBox();
  const navMid = nav!.y + nav!.height / 2;
  expect(Math.abs(logo!.y + logo!.height / 2 - navMid)).toBeLessThanOrEqual(1);
  expect(Math.abs(text!.y + text!.height / 2 - navMid)).toBeLessThanOrEqual(1.5);
});
