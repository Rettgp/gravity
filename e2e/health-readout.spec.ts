import { expect, test } from '@playwright/test';
import { addDays } from '@gravity/shared';
import { signIn } from './helpers';

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})();

// Mocked API with deliberate gaps, so the chart is forced through days that have no data.
const days = Array.from({ length: 40 }, (_, i) => addDays(today, -i))
  .filter((_, i) => i % 4 !== 2 && i > 1) // no data today or yesterday, and every fourth day missing
  .map((date, i) => ({
    date,
    restingHr: 62 + (i % 5),
    hrv: 40 + (i % 7),
    sleepMinutes: 400 + (i % 6) * 10,
    sleepDeepMin: 70,
    sleepRemMin: 90,
    sleepLightMin: 220 + (i % 6) * 10,
    sleepAwakeMin: 20,
    steps: 5000 + i * 100,
  }));

test.describe('detail readout', () => {
  test('the chart does not move as the readout goes from a value to "No data" and back', async ({ page }, info) => {
    await page.route('**/api/health/profiles/*/link', (r) =>
      r.fulfill({ json: { configured: true, connected: true, needsReconnect: false, backfillDone: true, lastSyncAt: new Date().toISOString(), connectedAt: new Date().toISOString() } }),
    );
    await page.route('**/api/health/profiles/*/days*', (r) => r.fulfill({ json: days }));
    await signIn(page, 'teen');
    await page.goto('/app/health');

    for (const [tile, chartName] of [
      ['Resting heart rate', /^Resting heart rate, /],
      ['Sleep', /^Sleep stages per night/],
    ] as const) {
      await page.getByRole('button', { name: `Open ${tile} details` }).click();
      const dlg = page.getByRole('dialog', { name: tile });
      await expect(dlg).toBeVisible();
      await page.waitForTimeout(500); // open animation
      const chart = dlg.getByRole('group', { name: chartName });
      await chart.focus();
      const readout = chart.locator('xpath=preceding-sibling::*[contains(@class,"hl-readout")][1]');
      const seen = new Set<string>();
      let top: number | undefined;
      let height: number | undefined;
      // Walk left across 14 days: values, and the gaps between them.
      for (let i = 0; i < 14; i++) {
        const box = (await chart.boundingBox())!;
        const rb = (await readout.boundingBox())!;
        top ??= box.y;
        height ??= rb.height;
        expect(Math.abs(box.y - top), `chart moved at step ${i} (${await readout.innerText()})`).toBeLessThan(0.5);
        expect(Math.abs(rb.height - height), `readout height changed at step ${i}`).toBeLessThan(0.5);
        seen.add(/No (stage )?data/.test(await readout.innerText()) ? 'none' : 'value');
        await page.keyboard.press('ArrowLeft');
      }
      // The test only means something if it actually crossed both kinds of day.
      expect([...seen].sort(), `${tile}: expected to see both values and gaps`).toEqual(['none', 'value']);
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();
    }
    void info;
  });
});
