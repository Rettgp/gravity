import { expect, test } from '@playwright/test';
import { expectNoOverflow, isoToday, signIn, watchErrors } from './helpers';

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

test.describe('home dashboard', () => {
  test('without a planner year or trips there are no trip or Christmas cards, and the page is clean', async ({ page }, info) => {
    const errors = watchErrors(page);
    // The local database is shared with other specs, so the "nothing set up yet" state is simulated at the network edge.
    await page.route('**/api/trips', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: [] }) : r.continue()));
    await page.route('**/api/planner/years', (r) => r.fulfill({ json: { years: [] } }));
    await signIn(page, info.project.name === 'mobile' ? 'teen' : 'dad');
    await expect(page.getByRole('region', { name: 'Greeting' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Trip:/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Christmas', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: "Today's meals" })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Services' })).toHaveCount(0);
    expect(errors.filter((e) => !/DevTools|404|Failed to load resource/.test(e))).toEqual([]);
  });

  test('a trip created through the API shows on the next-trip card; no overflow in light or dark', async ({ page }, info) => {
    const headers = { 'x-dev-user': 'mom@gravity.local' };
    const name = 'Dash trip ' + Date.now();
    const lead = info.project.name === 'mobile' ? 1 : 2; // the shared database keeps the other project's trip, and the soonest trip wins the card
    const start = addDays(isoToday(), lead);
    const res = await page.request.post('/api/trips', { headers, data: { name, destination: 'Nowhere', startDate: start, endDate: addDays(start, 2), family: ['Mom'] } });
    expect(res.status()).toBe(201);
    await signIn(page, 'mom');
    const card = page.getByRole('link', { name: 'Trip: ' + name });
    await expect(card).toBeVisible();
    await expect(card).toContainText(lead + (lead === 1 ? ' day' : ' days') + ' until check-in');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectNoOverflow(page);
    }
  });
});
