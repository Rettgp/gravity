import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ART, expectNoOverflow, goTo, isoToday, signIn } from './helpers';

const H = (who: string) => ({ 'x-dev-user': who + '@gravity.local' });
const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T12:00:00');
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
};
const nav = (page: Page) => page.getByRole('navigation', { name: 'Trip sections' });
const tab = (page: Page, name: string | RegExp) => nav(page).getByRole('link', { name }).click();
type Trip = { meta: { id: string }; sections: Record<string, { rev: number; data: any }> };

async function apiTrip(request: APIRequestContext, over: Record<string, unknown>) {
  const res = await request.post('/api/trips', { headers: H('mom'), data: { destination: 'Testville', startDate: addDays(isoToday(), 30), endDate: addDays(isoToday(), 32), family: ['Ann', 'Bo'], ...over } });
  expect(res.status()).toBe(201);
  return (await res.json()).id as string;
}
const getTrip = async (request: APIRequestContext, id: string) => (await (await request.get('/api/trips/' + id, { headers: H('dad') })).json()) as Trip;
async function putSection(request: APIRequestContext, id: string, key: string, edit: (d: any) => void) {
  const cur = (await getTrip(request, id)).sections[key]!;
  edit(cur.data);
  expect((await request.put(`/api/trips/${id}/sections/${key}`, { headers: H('dad'), data: { rev: cur.rev, data: cur.data } })).status()).toBe(200);
}
const saved = (request: APIRequestContext, id: string, key: string, pick: (d: any) => unknown, want: unknown) =>
  expect.poll(async () => pick((await getTrip(request, id)).sections[key]!.data), { timeout: 8000 }).toEqual(want);

test.describe('trips', () => {
  test('empty state', async ({ page }) => {
    // Stubbed, so it does not depend on what other specs left in the shared local database.
    await page.route('**/api/trips', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: [] }) : r.continue()));
    await signIn(page, 'mom');
    await goTo(page, 'Trips');
    await expect(page.getByRole('heading', { name: 'No trips yet' })).toBeVisible();
    await expectNoOverflow(page);
  });

  test('create, plan, tick, cost, persist, copy lists', async ({ page, request }) => {
    const tag = test.info().project.name;
    const name = 'Lake trip ' + tag;
    await signIn(page, 'mom');
    await goTo(page, 'Trips');
    await page.getByRole('button', { name: 'New trip' }).click();
    const sheet = page.getByRole('dialog', { name: 'New trip' });
    await sheet.getByLabel('Name', { exact: true }).fill(name);
    await sheet.getByLabel('Destination').fill('Testville');
    await sheet.getByLabel('Start date').fill(addDays(isoToday(), 20));
    await sheet.getByLabel('End date').fill(addDays(isoToday(), 22));
    await sheet.getByRole('button', { name: 'Create trip' }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    const id = page.url().split('/').pop()!;
    await expect(nav(page).locator('a[href*="/day/"]')).toHaveCount(3);
    await expectNoOverflow(page);

    // Day: add two events, reorder, edit, reminder, remove.
    await nav(page).locator('a[href*="/day/"]').first().click();
    for (const title of ['Alpha walk', 'Beta show']) {
      await page.getByRole('button', { name: 'Add event' }).first().click();
      const s = page.getByRole('dialog', { name: 'Add event' });
      await s.getByLabel('Title').fill(title);
      await s.getByLabel('Time shown').fill('9 AM');
      await s.getByRole('button', { name: 'Add to day' }).click();
    }
    const titles = page.locator('.tr-event h3');
    await expect(titles).toHaveText(['Alpha walk', 'Beta show']);
    await page.locator('.tr-event', { hasText: 'Alpha walk' }).getByRole('button', { name: 'Move later' }).click();
    await expect(titles).toHaveText(['Beta show', 'Alpha walk']);
    await page.getByRole('button', { name: 'Edit Beta show' }).click();
    const es = page.getByRole('dialog', { name: 'Edit event' });
    await es.getByLabel('Title').fill('Beta concert');
    await es.getByRole('button', { name: 'Save event' }).click();
    await expect(titles).toHaveText(['Beta concert', 'Alpha walk']);
    await page.getByLabel('Add reminder for Beta concert').fill('Bring ticket');
    await page.getByLabel('Add reminder for Beta concert').press('Enter');
    await expect(page.getByRole('list', { name: 'Reminders for Beta concert' })).toContainText('Bring ticket');
    await page.getByRole('button', { name: 'Remove Alpha walk' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(titles).toHaveText(['Beta concert']);
    await page.screenshot({ path: ART + '/trips-day-' + tag + '.png' });

    // Packing: counts change.
    await tab(page, 'Packing');
    await page.getByLabel('Add a to-do').fill('Passports');
    await page.getByLabel('Add a to-do').press('Enter');
    await page.getByLabel('Add to Gear').fill('Charger');
    await page.getByLabel('Add to Gear').press('Enter');
    await expect(page.getByLabel('Packed count')).toHaveText('Packed 0 / 1');
    await expect(page.getByLabel('To-do count')).toHaveText('0 / 1 done');
    await page.getByRole('checkbox', { name: 'Done: Charger' }).click();
    await page.getByRole('checkbox', { name: 'Done: Passports' }).click();
    await expect(page.getByLabel('Packed count')).toHaveText('Packed 1 / 1');
    await expect(page.getByLabel('To-do count')).toHaveText('1 / 1 done');

    // Grocery.
    await tab(page, 'Grocery');
    await page.getByLabel('Add to Breakfast').fill('Eggs');
    await page.getByLabel('Add to Breakfast').press('Enter');
    await expect(page.getByLabel('Item count')).toHaveText('1 item');

    // Logistics: a to-confirm row and a booked ticket.
    await tab(page, 'Logistics');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const conf = page.getByRole('region', { name: 'To confirm' });
    await conf.getByRole('button', { name: 'Add row' }).click();
    await conf.getByLabel('Row label 1').fill('Shuttle');
    await conf.getByLabel('Row value 1').fill('Ask the desk');
    await conf.getByRole('checkbox', { name: 'To confirm' }).check();
    await page.getByRole('button', { name: 'Add ticket' }).click();
    await page.getByLabel('Ticket name').fill('Show tickets');
    await page.getByLabel('Ticket name').blur();
    await page.getByRole('checkbox', { name: /Booked/ }).check();
    await expect(page.locator('.tr-ticket.booked')).toHaveCount(1);
    await page.getByRole('button', { name: 'Done editing' }).click();
    await expect(page.getByRole('region', { name: 'To confirm' })).toContainText('Shuttle');

    // Cost.
    await tab(page, 'Cost');
    await page.getByLabel('Amount for Lodging').fill('1200');
    await page.getByLabel('Amount for Groceries').fill('300.50');
    await page.getByLabel('Amount for Groceries').blur();
    await expect(page.getByLabel('Total cost')).toHaveText('$1,500.50');

    // Everything reached the server, and survives a reload.
    await saved(request, id, 'costs', (d) => d.rows.map((r: any) => r.amount).slice(0, 2), ['1200', '300.50']);
    await saved(request, id, 'logistics', (d) => [d.sections[4].rows[0].tbd, d.tickets[0].booked, d.tickets[0].name], [true, true, 'Show tickets']);
    await page.reload();
    await expect(page.getByLabel('Total cost')).toHaveText('$1,500.50');
    await tab(page, 'Packing');
    await expect(page.getByLabel('Packed count')).toHaveText('Packed 1 / 1');
    await tab(page, 'Logistics');
    await expect(page.locator('.tr-ticket.booked')).toContainText('Show tickets');
    await nav(page).locator('a[href*="/day/"]').first().click();
    await expect(page.locator('.tr-event h3')).toHaveText(['Beta concert']);
    await expect(page.getByRole('list', { name: 'Reminders for Beta concert' })).toContainText('Bring ticket');

    // A second trip copies the lists, unchecked.
    await goTo(page, 'Trips');
    await page.getByRole('button', { name: 'New trip' }).click();
    const s2 = page.getByRole('dialog', { name: 'New trip' });
    await s2.getByLabel('Name', { exact: true }).fill('Copy of ' + name);
    await s2.getByLabel('Destination').fill('Elsewhere');
    await s2.getByLabel('Start date').fill(addDays(isoToday(), 60));
    await s2.getByLabel('End date').fill(addDays(isoToday(), 61));
    await s2.getByLabel('Copy packing and grocery lists from').selectOption({ label: name });
    await s2.getByRole('button', { name: 'Create trip' }).click();
    await expect(page.getByRole('heading', { name: 'Copy of ' + name, level: 1 })).toBeVisible();
    await tab(page, 'Packing');
    await expect(page.getByRole('checkbox', { name: 'Done: Charger' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('checkbox', { name: 'Done: Passports' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByLabel('Packed count')).toHaveText('Packed 0 / 1');
  });

  test('a finished trip is history and stays readable', async ({ page, request }) => {
    const tag = test.info().project.name;
    const name = 'Old trip ' + tag;
    const id = await apiTrip(request, { name, startDate: '2020-01-10', endDate: '2020-01-12' });
    await putSection(request, id, 'packing', (d) => void d.todo.push({ label: 'Old passports', checked: true }));
    await signIn(page, 'mom');
    await goTo(page, 'Trips');
    if (tag === 'desktop') {
      // The sidebar keeps past trips too, under their year; the Trips row itself is the way to the full list.
      const rail = page.getByRole('navigation', { name: 'Trips pages' });
      await expect(rail.locator('.sb-subhead', { hasText: '2020' })).toBeVisible();
      await expect(rail.getByRole('link', { name })).toBeVisible();
      await expect(rail.getByRole('link', { name: 'All trips' })).toHaveCount(0);
    }
    const past = page.getByRole('region', { name: 'Past trips' });
    await expect(past.getByRole('link', { name: new RegExp(name) })).toContainText('Completed');
    await past.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByText('Trip complete')).toBeVisible();
    await tab(page, /^Fri /);
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    await tab(page, 'Dining');
    await expect(page.getByRole('heading', { name: 'Dining' })).toBeVisible();
    await tab(page, 'Grocery');
    await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeVisible();
    await tab(page, 'Packing');
    await expect(page.getByRole('checkbox', { name: 'Done: Old passports' })).toHaveAttribute('aria-checked', 'true');
    await tab(page, 'Logistics');
    await expect(page.getByRole('heading', { name: 'Tickets & bookings' })).toBeVisible();
    await tab(page, 'Cost');
    await expect(page.getByLabel('Total cost')).toHaveText('$0.00');
  });

  test('a trip close to departure lists unconfirmed items under Before you go', async ({ page, request }) => {
    const id = await apiTrip(request, { name: 'Soon ' + test.info().project.name, startDate: addDays(isoToday(), 3), endDate: addDays(isoToday(), 4), checkIn: addDays(isoToday(), 3) + 'T16:00' });
    await putSection(request, id, 'logistics', (d) => void d.sections[4].rows.push({ label: 'Shuttle', value: 'Ask the desk', tbd: true }));
    await signIn(page, 'mom');
    await page.goto('/app/trips/' + id);
    await expect(page.getByRole('region', { name: "What's next" })).toContainText(/days until check-in/);
    await expect(page.getByRole('heading', { name: 'Before you go' })).toBeVisible();
    await expect(page.getByRole('region', { name: "What's next" })).toContainText('Shuttle');
  });

  test('another family member sees an edit; a conflicting write shows the notice and loses nothing', async ({ page, request, browser }) => {
    const id = await apiTrip(request, { name: 'Shared ' + test.info().project.name });
    await signIn(page, 'mom');
    await page.goto(`/app/trips/${id}/packing`);
    await page.getByLabel('Add a to-do').fill('Mom item');
    await page.getByLabel('Add a to-do').press('Enter');
    await saved(request, id, 'packing', (d) => d.todo.map((t: any) => t.label), ['Mom item']);

    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const dad = await ctx.newPage();
    await signIn(dad, 'dad');
    await dad.goto(`/app/trips/${id}/packing`);
    await expect(dad.getByRole('checkbox', { name: 'Done: Mom item' })).toBeVisible();
    await ctx.close();

    // Another device saves between this page's read and its next save.
    await putSection(request, id, 'packing', (d) => void d.todo.push({ label: 'Saved elsewhere', checked: false }));
    await page.getByLabel('Add a to-do').fill('Lost local');
    await page.getByLabel('Add a to-do').press('Enter');
    await expect(page.getByRole('status')).toContainText('Updated on another device');
    await expect(page.getByRole('checkbox', { name: 'Done: Saved elsewhere' })).toBeVisible();
    expect((await getTrip(request, id)).sections.packing!.data.todo.map((t: any) => t.label)).toEqual(['Mom item', 'Saved elsewhere']);
  });

  test('a failed save keeps what was typed, retries, and persists', async ({ page, request }) => {
    const id = await apiTrip(request, { name: 'Flaky ' + test.info().project.name });
    await signIn(page, 'mom');
    await page.goto(`/app/trips/${id}/packing`);
    await expect(page.getByLabel('Add a to-do')).toBeVisible();
    let failed = 0;
    await page.route(`**/api/trips/${id}/sections/packing`, (r) => {
      if (r.request().method() === 'PUT' && failed++ === 0) return r.fulfill({ status: 503, json: { error: 'down' } });
      return r.continue();
    });
    await page.getByLabel('Add a to-do').fill('Survives outage');
    await page.getByLabel('Add a to-do').press('Enter');
    await expect(page.getByRole('alert')).toContainText('Not saved yet');
    await expect(page.getByRole('checkbox', { name: 'Done: Survives outage' })).toBeVisible();
    await saved(request, id, 'packing', (d) => d.todo.map((t: any) => t.label), ['Survives outage']);
    expect(failed).toBeGreaterThanOrEqual(2);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Done: Survives outage' })).toBeVisible();
  });

  test('no overflow on any trip page, light and dark; screenshots', async ({ page, request }) => {
    const tag = test.info().project.name;
    const id = await apiTrip(request, { name: 'Weekend at the lake ' + tag, destination: 'Testville, Exampleland', startDate: addDays(isoToday(), 5), endDate: addDays(isoToday(), 7), checkIn: addDays(isoToday(), 5) + 'T16:00', checkOut: addDays(isoToday(), 7) + 'T10:00' });
    const day = addDays(isoToday(), 5);
    await putSection(request, id, `day-${day}`, (d) => {
      d.goal = 'A **slow** first day with [a map](https://example.test/map).';
      d.events.push(
        { id: 'a', time: '4:00 PM', at: '16:00', title: 'Check in at the cabin with a very long title to test wrapping on small screens', body: 'Collect keys. Call [the desk](tel:+15550100).', meta: ['**Code** 0000', 'Late arrival ok'], anchor: true, reminders: ['Bring the keys'] },
        { id: 'b', time: '6:30 PM', title: 'Dinner', body: 'Pasta night.', meta: [], anchor: false, reminders: [] },
      );
      d.notes.push('Pack **snacks** for the drive.');
      d.cards.push({ title: 'Cabin info', intro: 'Good to know', groups: [{ label: 'Wifi', rows: [{ label: 'Network', value: 'example' }, { label: 'Quiet hours', value: '10 PM', tbd: true }] }] });
    });
    await putSection(request, id, 'packing', (d) => {
      d.todo.push({ label: 'Book the cabin', checked: true }, { label: 'Print the maps', checked: false });
      d.people[0].groups[0].items.push({ label: 'Warm coat', checked: true }, { label: 'Comfortable walking shoes for a long hike', checked: false });
    });
    await putSection(request, id, 'logistics', (d) => {
      d.sections[0].rows.push({ label: 'Address', value: '1 Example Road' });
      d.sections[4].rows.push({ label: 'Shuttle', value: 'Ask the desk', tbd: true });
      d.tickets.push({ id: 't1', name: 'Boat tour', urgency: 'urgent', body: 'Book early.', booked: false }, { id: 't2', name: 'Museum', urgency: 'flexible', body: '', booked: true });
    });
    await putSection(request, id, 'costs', (d) => void ((d.rows[0].amount = '1200'), (d.rows[1].amount = '310.25')));
    const pages: [string, string][] = [['list', '/app/trips'], ['overview', `/app/trips/${id}`], ['day', `/app/trips/${id}/day/${day}`], ['dining', `/app/trips/${id}/dining`], ['grocery', `/app/trips/${id}/grocery`], ['packing', `/app/trips/${id}/packing`], ['logistics', `/app/trips/${id}/logistics`], ['cost', `/app/trips/${id}/cost`]];
    await signIn(page, 'mom');
    const sizes = tag === 'desktop' ? [{ width: 1280, height: 800 }, { width: 375, height: 812 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const [label, url] of pages) {
          await page.goto(url);
          await expect(page.locator('main h1, main h2').first()).toBeVisible();
          await expectNoOverflow(page);
          if (['list', 'overview', 'day', 'packing', 'logistics', 'cost'].includes(label))
            await page.screenshot({ path: `${ART}/wp7/${label}-${size ? size.width : 'pixel7'}-${scheme}.png` });
        }
      }
    }
  });
});
