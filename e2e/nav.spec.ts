import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('sidebar logo and wordmark are vertically centered in the brand row', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'sidebar only shows on desktop; phone navigation is covered in shell.spec.ts');
  await signIn(page, 'dad');
  const row = await page.locator('.sidebar .sb-brand').boundingBox();
  const logo = await page.locator('.sidebar .wordmark img').boundingBox();
  const text = await page.locator('.sidebar .wordmark span').boundingBox();
  const mid = row!.y + row!.height / 2;
  expect(Math.abs(logo!.y + logo!.height / 2 - mid)).toBeLessThanOrEqual(1);
  expect(Math.abs(text!.y + text!.height / 2 - mid)).toBeLessThanOrEqual(1.5);
});
