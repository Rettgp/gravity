/**
 * Convert the saved Branson artifact page into a trip import file.
 *   npm run migrate:branson -- [--device <device-*.json>] [--costs <costs.json>] [--html <artifact.html>] [--out <trip.json>] [--verbose]
 * Opens the page from disk in Chrome, pre-loads localStorage from the device file, overrides the costs with the artifact
 * database rows, lets the page's own script render, clicks through every section and reads the DOM into the section shapes
 * of packages/shared/src/trips.ts. Then proves nothing visible was dropped. Exit 1 on any problem. Everything under
 * migration/ is data: nothing from it is copied into source files.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { addDays, dayKey, sectionSchema, tripImport } from '@gravity/shared/server';

const TRIP = {
  id: 'branson-2026',
  destination: 'Branson, MO',
  startDate: '2026-11-21',
  endDate: '2026-11-24',
  checkIn: '2026-11-21T16:00',
  checkOut: '2026-11-24T10:30',
  tz: 'America/Chicago',
};
const DAY_COLORS = ['var(--green)', 'var(--coral)', 'var(--amber)', 'var(--cyan)'];

// ---- HTML -> Rich (pure, unit-tested) ---------------------------------------------------------------------------
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m)));
const SAFE_HREF = /^(https:\/\/|tel:|mailto:)/i;

/** innerHTML -> Rich: <strong>/<b> become **bold**, <a href> becomes [label](href) when the target is https/tel/mailto, <br> a newline, every other tag is dropped. */
export function richFromHtml(html: string): string {
  let out = '';
  let bold: string | null = null;
  let link: { href: string; text: string } | null = null;
  const emit = (s: string) => {
    if (link) link.text += s;
    else if (bold !== null) bold += s;
    else out += s;
  };
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)/gi)) {
    if (m[4] !== undefined) {
      emit(decode(m[4]));
      continue;
    }
    const close = m[1] === '/';
    const tag = m[2]!.toLowerCase();
    if (tag === 'br') emit('\n');
    else if ((tag === 'strong' || tag === 'b') && !link) {
      if (!close) bold = '';
      else if (bold !== null) {
        const [, lead = '', inner = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(bold)!;
        bold = null;
        emit(lead + (inner ? `**${inner}**` : '') + trail);
      }
    } else if (tag === 'a') {
      if (!close) link = { href: decode(/href\s*=\s*"([^"]*)"/i.exec(m[3]!)?.[1] ?? ''), text: '' };
      else if (link) {
        const { href, text } = link;
        link = null;
        const label = text.replace(/[\[\]]/g, '').trim();
        emit(SAFE_HREF.test(href) && label ? `[${label}](${href.replace(/\)/g, '%29').replace(/\s/g, '%20')})` : text);
      }
    }
  }
  return out
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

const plain = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Rich -> the text a reader sees: markup removed, whitespace normalised. */
export const richToText = (s: string) => plain(s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, ''));

// ---- In-page extraction -----------------------------------------------------------------------------------------
// Runs inside the page. Returns raw strings (innerHTML for rich fields); conversion happens in Node.
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const extractPage = (): Any => {
  const $ = (s: string, r: Any = document) => r.querySelector(s);
  const $$ = (s: string, r: Any = document): Any[] => [...r.querySelectorAll(s)];
  const t = (e: Any) => ((e && e.textContent) || '').replace(/\s+/g, ' ').trim();
  const h = (e: Any) => (e ? e.innerHTML : '');
  const sec = (id: string) => $(`section[data-section="${id}"]`);
  const kvRows = (dl: Any) => {
    const rows: Any[] = [];
    for (const dt of $$('dt', dl)) {
      const dd = dt.nextElementSibling;
      rows.push({ label: t(dt), value: h(dd), tbd: !!dd && dd.classList.contains('tbd') });
    }
    return rows;
  };
  const card = (c: Any) => {
    const out: Any = { title: '', intro: undefined, groups: [] };
    let cur: Any = null;
    for (const ch of [...c.children] as Any[]) {
      if (ch.tagName === 'H3') out.title = t(ch);
      else if (ch.classList.contains('section-sub')) out.intro = h(ch);
      else if (ch.classList.contains('height-group-label')) {
        cur = { label: t(ch), rows: [] };
        out.groups.push(cur);
      } else if (ch.classList.contains('height-grid') || ch.tagName === 'DL') {
        if (!cur) {
          cur = { rows: [] };
          out.groups.push(cur);
        }
        if (ch.tagName === 'DL') cur.rows.push(...kvRows(ch));
        else for (const r of $$('.height-row', ch)) cur.rows.push({ label: t($('.height-name', r)), value: h($('.height-req', r)), tbd: false });
        cur = null;
      }
    }
    return out;
  };
  const checks = (root: Any, rowSel: string) =>
    $$(rowSel, root).map((r) => ({ label: $('input[type=text]', r).value, checked: $('input[type=checkbox]', r).checked }));
  const checkGroups = (root: Any, itemsSel: string, groupSel: string) =>
    $$(groupSel, root).map((g) => ({ id: $(itemsSel, g).getAttribute('data-group'), title: t($('h3', g)), items: checks(g, '.pack-row, .grocery-row') }));

  const out: Any = {};
  const ov = sec('overview');
  const cards = $$('.overview-grid > .card', ov);
  out.overview = {
    plan: $$('p', cards[0]).map(h),
    party: h($$('p', cards[1])[0]),
    stay: h($$('p', cards[1])[1]),
  };
  out.name = t($('.brand h1'));
  out.eyebrow = t($('.brand .eyebrow'));
  out.days = [1, 2, 3, 4].map((n) => {
    const s = sec('day' + n);
    const nav = $(`.nav-item[data-target="day${n}"]`);
    return {
      title: t($('.section-head h2', s)),
      navLabel: [...nav.childNodes].filter((c: Any) => !(c.nodeType === 1 && (c.classList.contains('chip') || c.classList.contains('day-date')))).map((c: Any) => c.textContent).join('').replace(/\s+/g, ' ').trim(),
      goal: h($(':scope > .section-sub', s)),
      anchor: h($(`.glance-card[data-target="day${n}"] .anchor`, ov)),
      events: $$('.timeline .event', s).map((e) => ({
        id: $('.event-reminders', e).getAttribute('data-event-id'),
        time: t($('.event-time', e)),
        title: t($('h4', e)),
        body: h($(':scope > p:not(.event-meta)', e)),
        meta: $$(':scope > p.event-meta > span', e).map(h),
        anchor: e.classList.contains('anchor'),
        reminders: $$('.reminder-text', e).map(t),
      })),
      notes: $$(':scope > .note', s).map(h),
      cards: $$(':scope > .card', s).map(card),
    };
  });
  const dn = sec('dining');
  out.dining = {
    sub: h($(':scope > .section-sub', dn)),
    note: h($(':scope > .note', dn)),
    meals: $$(':scope > .card', dn).map((c) => ({
      title: t($(':scope > h3', c)),
      intro: h($(':scope > .section-sub', c)),
      groups: $$('.dine-group', c).map((g) => ({
        label: t($('.dine-group-label', g)),
        intros: $$(':scope > p.section-sub', g).map(h),
        metas: $$(':scope > p.dine-meta > span', g).map(h),
        items: $$('.dine-item', g).map((i) => ({
          name: t($('.dine-name', i)),
          tag: t($('.dine-tag', i)),
          body: h($(':scope > p:not(.dine-meta)', i)),
          meta: $$(':scope > p.dine-meta > span', i).map(h),
        })),
      })),
    })),
  };
  out.grocery = { groups: checkGroups(sec('grocery'), '.grocery-items', '.grocery-group') };
  const pk = sec('packing');
  out.packing = {
    todo: checks(pk, '#todoItems .todo-row'),
    people: $$('#packGrid > .card', pk).map((c) => ({ name: t($(':scope > h3', c)), groups: checkGroups(c, '.pack-items', '.pack-group') })),
  };
  const lg = sec('logistics');
  out.logistics = { sections: [] as Any[], tickets: [] as Any[] };
  for (const c of $$(':scope > .card', lg)) {
    if ($('.ticket-item', c)) {
      out.logistics.tickets = $$('.ticket-item', c).map((i) => {
        const a = $('.ticket-foot a', i);
        return {
          id: $('input[data-ticket]', i).getAttribute('data-ticket'),
          name: t($('.ticket-name', i)),
          urgency: ['urgent', 'moderate', 'flexible'].find((u) => $('.ticket-badge', i).classList.contains(u)),
          body: h($(':scope > p', i)),
          link: a ? { label: t(a), href: a.getAttribute('href') } : undefined,
          booked: $('input[data-ticket]', i).checked,
        };
      });
    } else out.logistics.sections.push({ title: t($('h3', c)), rows: kvRows($('dl', c)) });
  }
  out.costs = { rows: $$('.cost-row', sec('cost')).map((r) => ({ label: $('input[type=text]', r).value, amount: $('input[type=number]', r).value })), total: t($('#costTotal')) };
  return out;
};

const EXEMPT =
  'button, select, option, script, style, .event-ctrls, .reminder-add-row, .reminder-bullet, .date-tag, .day-no, .glance-cta, .glance-card h3, .next-up, .ticket-badge, .ticket-check, .pack-progress, ' +
  '.overview-grid h3, .card:has(#todoItems) > h3, [data-section="grocery"] .section-sub, [data-section="packing"] .section-sub, [data-section="cost"] .section-sub, ' +
  '[data-section="logistics"] .card:has(.ticket-item) > .section-sub, [data-section="logistics"] .card:has(.ticket-item) > h3, [data-section="logistics"] .section-head h2, [data-section="overview"] .section-head h2, [data-section="dining"] .section-head h2, ' +
  '[data-section="grocery"] .section-head h2, [data-section="packing"] .section-head h2, [data-section="cost"] .section-head h2, ' +
  '.card:has(#backupStatus)'; // the "Copy my trip data" backup card: page controls, not trip content

/** Runs in the page with the section on screen: every visible text node and visible input value, split into kept and exempt. */
const visibleTexts = ({ id, exempt }: { id: string; exempt: string }): { kept: string[]; exempt: string[] } => {
  const root = document.querySelector(`section[data-section="${id}"]`)!;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const kept: string[] = [];
  const skipped: string[] = [];
  const add = (el: Element, s: string) => {
    s = norm(s);
    if (!s || !(el as HTMLElement).checkVisibility()) return;
    // "Anchor:" is the label of the overview glance cards; the anchor text itself is checked.
    if (el.closest(exempt) || (el.closest('.glance-card') && s === 'Anchor:')) skipped.push(s);
    else kept.push(s);
  };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.parentElement) add(n.parentElement, n.textContent ?? '');
  for (const i of Array.from(root.querySelectorAll<HTMLInputElement>('input[type=text], input[type=number], textarea'))) if (!i.classList.contains('reminder-input')) add(i, i.value);
  return { kept, exempt: skipped };
};

// ---- Raw -> trip sections ---------------------------------------------------------------------------------------
const R = richFromHtml;
const hhmm = (iso: string) => iso.slice(11, 16);

interface RawEvent { day: string; label: string; start: string; end?: string }
type Sections = Record<string, unknown>;

export function buildSections(raw: Any, events: RawEvent[]): { meta: Any; sections: Sections } {
  const sections: Sections = {};
  sections.overview = { planParagraphs: raw.overview.plan.map(R), party: R(raw.overview.party), stay: R(raw.overview.stay) };
  raw.days.forEach((d: Any, i: number) => {
    const n = i + 1;
    const taken = new Set<number>();
    const anchor = R(d.anchor).replace(/^Anchor:\s*/, '');
    sections[dayKey(addDays(TRIP.startDate, i))] = {
      title: d.title,
      navLabel: d.navLabel,
      color: DAY_COLORS[i]!,
      ...(d.goal ? { goal: R(d.goal) } : {}),
      ...(anchor ? { anchor } : {}),
      events: d.events.map((e: Any) => {
        const idx = events.findIndex((x, k) => !taken.has(k) && x.day === 'day' + n && plain(x.label) === e.title);
        const m = idx >= 0 ? events[idx]! : undefined;
        if (idx >= 0) taken.add(idx);
        return {
          id: e.id,
          time: e.time,
          ...(m ? { at: hhmm(m.start), ...(m.end ? { until: hhmm(m.end) } : {}) } : {}),
          title: e.title,
          body: R(e.body),
          meta: e.meta.map(R),
          anchor: e.anchor,
          reminders: e.reminders,
        };
      }),
      notes: d.notes.map(R),
      cards: d.cards.map((c: Any) => ({
        title: c.title,
        ...(c.intro ? { intro: R(c.intro) } : {}),
        groups: c.groups.map((g: Any) => ({ ...(g.label ? { label: g.label } : {}), rows: g.rows.map((r: Any) => ({ label: r.label, value: R(r.value), ...(r.tbd ? { tbd: true } : {}) })) })),
      })),
    };
  });
  const di = raw.dining;
  sections.dining = {
    note: [di.sub, di.note].filter(Boolean).map(R).join('\n\n'),
    meals: di.meals.map((m: Any) => ({
      title: m.title,
      ...(m.intro ? { intro: R(m.intro) } : {}),
      groups: m.groups.map((g: Any) => {
        // Group intro paragraphs and the group-level info lines (e.g. an address) share the group's intro, one per line.
        const intro = [...g.intros, ...g.metas].map(R).join('\n');
        return {
          label: g.label,
          ...(intro ? { intro } : {}),
          items: g.items.map((it: Any) => ({ name: it.name, ...(it.tag ? { tag: it.tag } : {}), body: R(it.body), meta: it.meta.map(R) })),
        };
      }),
    })),
  };
  sections.grocery = raw.grocery;
  sections.packing = raw.packing;
  sections.logistics = {
    sections: raw.logistics.sections.map((s: Any) => ({ title: s.title, rows: s.rows.map((r: Any) => ({ label: r.label, value: R(r.value), ...(r.tbd ? { tbd: true } : {}) })) })),
    tickets: raw.logistics.tickets.map((t: Any) => ({ id: t.id, name: t.name, urgency: t.urgency, body: R(t.body), ...(t.link ? { link: t.link } : {}), booked: t.booked })),
  };
  sections.costs = { rows: raw.costs.rows };
  const meta = { id: TRIP.id, name: raw.name, eyebrow: raw.eyebrow, destination: TRIP.destination, startDate: TRIP.startDate, endDate: TRIP.endDate, checkIn: TRIP.checkIn, checkOut: TRIP.checkOut, tz: TRIP.tz };
  return { meta, sections };
}

// ---- Completeness -----------------------------------------------------------------------------------------------
const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
/** Every text in `texts` must appear (whitespace-normalised, markup removed) in the JSON `haystack`. Returns the ones that do not. */
export const missingTexts = (texts: string[], haystack: unknown[]) => {
  const hay = plain(strings(haystack).map(richToText).join(' '));
  return texts.filter((x) => !hay.includes(plain(x)));
};

// ---- CLI --------------------------------------------------------------------------------------------------------
const arg = (n: string) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const html = resolve(arg('html') ?? 'migration/branson/artifact.html');
  const costsFile = arg('costs') ?? 'migration/branson/artifact-db/trip/costs.json';
  const out = arg('out') ?? 'migration/branson/trip.json';
  const verbose = process.argv.includes('--verbose');
  const unwrap = (f: string) => {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    return j.data ?? j;
  };
  const keys: Record<string, string> = arg('device') ? { ...unwrap(arg('device')!).keys } : {};
  if (arg('device')) console.log(`Device keys loaded: ${Object.keys(keys).join(', ')}`);
  const costs = unwrap(costsFile).rows;
  if (!Array.isArray(costs)) throw new Error(costsFile + ' has no rows');
  keys['branson2026-costs-v1'] = JSON.stringify(costs);

  const src = readFileSync(html, 'utf8');
  const rawEvents = /var TRIP_EVENTS_RAW = (\[[\s\S]*?\n\s*\]);/.exec(src)?.[1];
  if (!rawEvents) throw new Error('TRIP_EVENTS_RAW not found in the page');

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.addInitScript(`window.__name = (f) => f; const k = ${JSON.stringify(keys)}; for (const n in k) localStorage.setItem(n, k[n]);`);
    await page.goto(pathToFileURL(html).href);
    await page.waitForSelector('#day1Timeline .event', { state: 'attached' });

    const events = (await page.evaluate((s) => (0, eval)('(' + s + ')'), rawEvents)) as RawEvent[];
    const raw = await page.evaluate(`(${extractPage.toString()})()`);
    const { meta, sections } = buildSections(raw, events);

    const problems: string[] = [];
    const parsed = tripImport.safeParse({ meta, sections });
    if (!parsed.success) problems.push('tripImport: ' + parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '));
    const clean: Sections = {};
    for (const [k, v] of Object.entries(sections)) {
      const r = sectionSchema(k).safeParse(v);
      if (r.success) clean[k] = r.data;
      else problems.push(`section ${k}: ` + r.error.issues.slice(0, 5).map((i) => i.path.join('.') + ': ' + i.message).join('; '));
    }

    // Click through every section and check its visible text against the JSON for that section.
    const days = Object.keys(sections).filter((k) => k.startsWith('day-')).sort();
    const keyOf: Record<string, string[]> = { overview: ['overview', ...days], dining: ['dining'], grocery: ['grocery'], packing: ['packing'], logistics: ['logistics'], cost: ['costs'] };
    days.forEach((k, i) => (keyOf['day' + (i + 1)] = [k]));
    console.log('\nCompleteness (visible text in each section must appear in its JSON)');
    for (const id of ['overview', 'day1', 'day2', 'day3', 'day4', 'dining', 'grocery', 'packing', 'logistics', 'cost']) {
      await page.click(`.nav-item[data-target="${id}"]`);
      const seen = (await page.evaluate(`(${visibleTexts.toString()})(${JSON.stringify({ id, exempt: EXEMPT })})`)) as { kept: string[]; exempt: string[] };
      const missing = missingTexts(seen.kept, keyOf[id]!.map((k) => clean[k]));
      console.log(`  ${id.padEnd(10)} checked ${String(seen.kept.length).padStart(4)}  exempt ${String(seen.exempt.length).padStart(3)}  missing ${missing.length}`);
      if (verbose && seen.exempt.length) console.log('     exempt: ' + seen.exempt.map((x) => JSON.stringify(x.slice(0, 60))).join(', '));
      for (const m of missing) problems.push(`[${id}] missing: ${JSON.stringify(m.slice(0, 200))}`);
    }
    // The page's own total must equal the one computed from the rows we exported.
    const total = costs.reduce((s: number, r: { amount: string }) => s + (parseFloat(r.amount) || 0), 0);
    const shown = (await page.evaluate(() => document.getElementById('costTotal')!.textContent)) ?? '';
    if (shown.replace(/[$,]/g, '') !== total.toFixed(2)) problems.push(`cost total: page shows ${shown}, rows add up to ${total.toFixed(2)}`);

    // Counts
    const c = clean as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log('\nCounts');
    for (const k of days) console.log(`  ${k}: ${c[k].events.length} events, ${c[k].events.filter((e: Any) => e.at).length} with at/until, ${c[k].events.reduce((n: number, e: Any) => n + e.reminders.length, 0)} reminders, ${c[k].notes.length} notes, ${c[k].cards.length} cards (${c[k].cards.map((x: Any) => x.groups.reduce((n: number, g: Any) => n + g.rows.length, 0)).join('+')} rows)`);
    console.log(`  overview: ${c.overview.planParagraphs.length} paragraphs`);
    console.log(`  dining: ${c.dining.meals.map((m: Any) => m.title + ' ' + m.groups.reduce((n: number, g: Any) => n + g.items.length, 0)).join(', ')}`);
    console.log(`  grocery: ${c.grocery.groups.map((g: Any) => g.id + ' ' + g.items.length).join(', ')} = ${c.grocery.groups.reduce((n: number, g: Any) => n + g.items.length, 0)} items`);
    console.log(`  packing: ${c.packing.todo.length} to-dos, ${c.packing.people.map((p: Any) => p.groups.reduce((n: number, g: Any) => n + g.items.length, 0)).join('+')} = ${c.packing.people.reduce((n: number, p: Any) => n + p.groups.reduce((m: number, g: Any) => m + g.items.length, 0), 0)} items, ${c.packing.people.length} people`);
    console.log(`  logistics: ${c.logistics.sections.map((s: Any) => s.title + ' ' + s.rows.length).join(', ')}; ${c.logistics.tickets.length} tickets (${c.logistics.tickets.filter((t: Any) => t.booked).length} booked)`);
    console.log(`  costs: ${c.costs.rows.length} rows, total $${total.toFixed(2)} (page shows ${shown})`);

    mkdirSync(dirname(out), { recursive: true });
    if (problems.length) {
      writeFileSync(out.replace(/\.json$/, '.failed.json'), JSON.stringify({ meta, sections }, null, 1));
      console.error(`\nFAILED: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
      process.exitCode = 1;
      return;
    }
    writeFileSync(out, JSON.stringify({ meta: parsed.success ? parsed.data.meta : meta, sections: clean }, null, 1));
    console.log(`\nOK: wrote ${out} (${Object.keys(clean).length} sections)`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
