import { expect, test } from '@playwright/test';
import { expectNoOverflow, signIn, watchErrors } from './helpers';

test('feedback: file a bug from the account menu, finish it, filter, delete', async ({ page }, info) => {
  const errors = watchErrors(page);
  const text = 'Meal tiles overlap ' + info.project.name;
  await signIn(page, 'mom');

  // Reach it the way the owner will: the account menu (sidebar footer from 768px, top bar on a phone).
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Feedback' }).click();
  await expect(page).toHaveURL(/\/app\/feedback$/);
  await expect(page.getByRole('heading', { name: 'Feedback', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'New' }).click();
  const sheet = page.getByRole('dialog', { name: 'New feedback' });
  // The area list is driven by the nav, so modules added later show up on their own.
  const options = await sheet.getByLabel('Area').locator('option').allTextContents();
  expect(options).toEqual(expect.arrayContaining(['Home', 'Trips', 'Planner', 'Meals', 'Family', 'Other']));
  await sheet.getByRole('radio', { name: 'Bug' }).click();
  await sheet.getByLabel('Area').selectOption('Meals');
  await sheet.getByLabel('Description').fill(text);
  await expect(sheet.getByText(`${text.length} / 2000`)).toBeVisible();
  await sheet.getByRole('button', { name: 'Add feedback' }).click();
  await expect(sheet).toBeHidden();

  const open = page.getByRole('region', { name: 'Open' });
  const done = page.getByRole('region', { name: 'Done' });
  await expect(open.getByText(text)).toBeVisible();
  await expectNoOverflow(page);

  await page.getByRole('checkbox', { name: 'Done: ' + text }).click();
  await expect(done.getByText(text)).toBeVisible();
  await expect(open.getByText(text)).toBeHidden();

  // Filter by area, then by status.
  const filters = page.getByRole('region', { name: 'Filters' });
  await filters.getByRole('button', { name: 'Planner', exact: true }).click();
  await expect(page.getByText(text)).toBeHidden();
  await filters.getByRole('button', { name: 'Meals', exact: true }).click();
  await expect(page.getByText(text)).toBeVisible();
  await filters.getByRole('radio', { name: 'Open' }).click();
  await expect(page.getByText(text)).toBeHidden();
  await filters.getByRole('radio', { name: 'Done' }).click();
  await expect(page.getByText(text)).toBeVisible();

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expectNoOverflow(page);
  }

  // Delete asks first.
  await page.getByRole('button', { name: 'Delete: ' + text }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete this feedback?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(text)).toBeVisible();
  await page.getByRole('button', { name: 'Delete: ' + text }).click();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(text)).toBeHidden();

  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});
