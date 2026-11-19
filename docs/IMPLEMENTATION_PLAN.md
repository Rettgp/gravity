# Gravity consolidation: implementation plan

Merge the Christmas/Birthday planner and the Branson trip artifact into Gravity, add multi-trip support, and rework the whole UI as a glass, app-like dashboard with light and dark themes.

This document is the handoff for implementation agents. Each work package (WP) in section 7 is one agent's job. Read sections 1 to 6 first, then only your WP.

## 1. Rules that override everything else

1. **No data loss.** Nothing in production is deleted or overwritten by this project. Source tables, the old stack and the artifact stay intact until the owner signs off in writing. Every migration is copy-only, re-runnable, and verified by a script that exits non-zero on any difference.
2. **Security is unchanged.** Every new route sits behind the Cognito JWT authorizer and the allowlist gate in `createRouter`. No new public endpoints, no presigned URLs. `tests/infra.test.ts` must still pass and must cover the new routes.
3. **Mobile first, native feel.** Every screen works at 375x812 with no horizontal scroll, 44px tap targets, safe-area insets, bottom sheets for editing, 16px inputs.
4. **Glass, same colors.** Only tokens from `apps/web/src/styles/tokens.css`. No new brand hues, no Google Fonts, no hex values outside `tokens.css`.
5. **Tested locally before any deploy.** `npm run verify` (typecheck + vitest + Playwright desktop and mobile) is green at the end of every WP. Migrations are rehearsed against a local copy of real data before they touch AWS.
6. **Real family data never enters git.** Exports and snapshots live in `migration/` (gitignored). Trip content (addresses, confirmation numbers, wifi codes) is data, not source.
7. **Never run against AWS without the owner's go-ahead** for that specific command: `npm run deploy`, any `aws ... put/update/delete/disable`, and the production import. Read-only `aws` calls are fine.
8. Follow `CLAUDE.md` and the existing patterns. Reuse before writing. No new dependencies except `lucide-react` (WP1) and `@aws-sdk/client-sesv2` (WP3).

## 2. What exists today (verified 2026-11-16)

| System | Where | Stack | Data |
|---|---|---|---|
| Gravity | `D:\Projects\gravity`, CFN stack `gravity`, us-east-2 | React 19 + Vite + Tailwind v4, TS Lambdas, CDK, Cognito | Tables `gravity-core` (16 rows), `gravity-health` (749), `gravity-journal` (63), `gravity-meals` (116), photos bucket. **Not touched by this project.** |
| Christmas planner | `D:\Projects\christmas-planner` (not a git repo), CFN stack `christmas-planner`, same account and region | React 19 SPA, **Python** Lambda, raw CloudFormation, own Google cookie auth | Table `christmas-planner-PlannerTable-8JH9WLMLD77X`, 110 rows: 1 year (2026), 64 gifts, 10 bday_gifts, 4 bday_decorations, 1 bday_yes_day, 8 budget_categories, 2 expenses, 8 bucket_list, 5 todos, 7 feedback. PITR on, `DeletionPolicy: Retain`. |
| Branson trip | A Claude artifact (link kept out of the repo; it is in the owner's artifact list as "Branson Trip 2026"), snapshot at `migration/branson/artifact.html` | One static HTML page, vanilla JS | See below |

Branson data lives in three places, and all three must be captured:

- **Static HTML**: overview, days 2 to 4 timelines, dining, logistics, tickets, ride-height and show cards, notes.
- **Artifact database**: `trip/costs` = `{rows:[{label,amount}], rev}`. Snapshot at `migration/branson/artifact-db/trip/costs.json` (version 39; three amounts filled in).
- **Each device's localStorage** (not shared between phones): `branson2026-packing-v2`, `-todo-v1`, `-grocery-v1`, `-day1-events-v1`, `-reminders-v1`, `-tickets-v1`, `-costs-v1`. Defaults are in the page script, so a device that never edited a list has nothing stored for it.

The trip is **2026-11-21 to 2026-11-24**. See decision D1.

## 3. Decisions (defaults chosen; owner can override before WP start)

| # | Decision | Default |
|---|---|---|
| D1 | When Branson moves | Build and test now with a snapshot. The artifact stays the source of truth through the trip. Final import after Nov 24 (or earlier only if WP9 is fully signed off). The import is re-runnable. |
| D2 | Old Christmas site after cutover | Disable its CloudFront distribution and its EventBridge price rule (both reversible). Do not delete the stack or table in this project. |
| D3 | Gift product photos | Come from store CDNs, so CSP `img-src` gains `https:`. Referrer policy is already `no-referrer`. |
| D4 | Christmas look | Adopts the Gravity palette and fonts. Pine/cranberry/gold and the script fonts go. Snowfall and birthday confetti stay. Christmas and birthday get an accent from existing tokens only (`--green`/`--coral`, `--violet`/`--amber`). |
| D5 | Trip deletion | Not offered. Past trips are history. |
| D6 | Christmas "Meal Planner" and "Travel Planner" pages | Kept as planner pages with their own collections. Not merged with Gravity Meals or the new Trips module (prod has 0 rows in `meals`, `trips`, `packing`, so no data forces a merge). |
| D7 | Search box and notification bell from the reference image | Left out. Nothing to search or notify yet. |

## 4. Target architecture

```
apps/web/src/
  components/shell/      AppShell, Sidebar, TopBar, TabBar, MoreSheet, SubNav   (WP2)
  components/Sheet.tsx   moved from modules/meals/Sheet.tsx, used everywhere    (WP2)
  modules/planner/       ported Christmas + Birthday planner                   (WP6)
  modules/trips/         new multi-trip module                                 (WP7)
  styles/tokens.css      + glass tokens                                        (WP2)
  styles/glass.css       shared glass primitives                               (WP2)
services/planner/        TS port of the Python API + price tracker             (WP3)
services/trips/          new                                                   (WP4)
packages/shared/src/     planner.ts, trips.ts (zod schemas, types)             (WP3, WP4)
scripts/                 migrate-planner.ts, export-branson.ts, import-trip.ts (WP8)
infra/lib/gravity-stack.ts   two more GravityService + one EventBridge rule    (WP1, WP3)
```

Both new services follow the house pattern exactly: `services/<name>/src/{router.ts,handler.ts}`, `build<Name>Router({db, table, allowlist, now?})`, one `GravityService` in the stack, one entry in `scripts/local-server.ts` and `tests/helpers.ts`, routes at `/api/<name>/*`. Cost impact is about $0 (on-demand tables, two small Lambdas, one free schedule).

Web routes:

```
/app                        Home dashboard
/app/journal  /app/health  /app/meals  /app/profiles     unchanged paths
/app/planner                occasion chooser (old /start)
/app/planner/christmas/{dashboard,setup,todos,budget,gifts,cards,decorations,shopping,meals,traditions,travel,feedback,print}
/app/planner/birthday/{budget,gifts,decorations,yes-day,feedback}
/app/trips                  upcoming + history list, "New trip"
/app/trips/:tripId          trip overview
/app/trips/:tripId/{day/:dayId,dining,grocery,packing,logistics,cost}
```

### 4.1 Planner service (`/api/planner`)

A straight TypeScript port of `christmas-planner/backend/planner/{handler,store,prices}.py`. Same behaviour, same validation, same limits.

Routes (port all, drop `/auth/*`, `/me`, `/health`, the CSRF header and the origin-verify header, which Cognito + API Gateway replace):

| Method | Path |
|---|---|
| GET | `/years` |
| GET, DELETE | `/years/:year` |
| PUT | `/years/:year/settings` |
| POST | `/years/:year/import` (4 MB cap) |
| PUT, DELETE | `/years/:year/items/:collection/:id` (64 KB cap, `ID_RE`, the 19 `COLLECTIONS`) |
| POST | `/years/:year/:giftCollection/:id/check-price` |
| POST | `/link-image` |
| GET | `/feedback` |
| PUT, DELETE | `/feedback/:id` |

Storage, table `gravity-planner`. **Key strings are identical to the old table** so migration is a rename and verification is a deep-equal:

| Old (`PK`,`SK`,`doc` JSON string) | New (`pk`,`sk`,`doc` native map, `updatedBy`, `updatedAt`) |
|---|---|
| `HH#main` / `Y#2026` | same strings |
| `HH#main#Y#2026` / `I#<collection>#<id>` | same strings |
| `HH#main` / `F#<id>` | same strings |

Price tracker (`services/planner/src/prices.ts`): port `prices.py` function for function, including the SSRF guard (`dns.lookup(all)` then reject any non-public address, re-check on every redirect with `redirect: 'manual'`), the 3 MB page cap, the 8s timeout, Amazon mobile-page handling, JSON-LD and meta extraction, `merge_tracker`, `check_gift`, and the allowlist check on the alert recipient. Page fetching and email sending are injected deps (`fetchPage`, `sendEmail`) so tests and local mode never hit the network; local mode logs the alert to the console. In AWS: `@aws-sdk/client-sesv2`, env `PRICE_ALERT_FROM`, IAM `ses:SendEmail`, a daily `cron(0 14 * * ? *)` rule targeting the function, handled the way `services/health/src/handler.ts` handles `source === 'aws.events'`. Lambda timeout 60s. SES identities are already verified in this account.

Port `backend/tests/test_api.py` and `test_prices.py` case for case to `tests/planner.test.ts` and `tests/prices.test.ts`.

### 4.2 Trips service (`/api/trips`)

Storage, table `gravity-trips`:

| pk | sk | Content |
|---|---|---|
| `TRIPS` | `T#<tripId>` | meta: `{id, name, eyebrow, destination, startDate, endDate, checkIn, checkOut, tz, createdBy, createdAt}` |
| `TRIP#<tripId>` | `S#<key>` | `{rev, data, updatedBy, updatedAt}`, one item per section |

Section keys and shapes (zod in `packages/shared/src/trips.ts`):

```ts
type Rich = string;                       // plain text + **bold** + [label](https://url) only
type Check = { label: string; checked: boolean };
type Row   = { label: string; value: Rich; tbd?: boolean };
type InfoCard = { title: string; intro?: Rich; groups: { label?: string; rows: Row[] }[] };

overview : { planParagraphs: Rich[]; party: Rich; stay: Rich }
day-<YYYY-MM-DD> : { title; navLabel; color; goal?: Rich; anchor?: Rich;
                     events: { id; time: string; at?: 'HH:MM'; until?: 'HH:MM'; title; body: Rich;
                               meta: Rich[]; anchor: boolean; reminders: string[] }[];
                     notes: Rich[]; cards: InfoCard[] }
dining   : { note?: Rich; meals: { title; groups: { label; items: { name; tag?; body: Rich; meta: Rich[] }[] }[] }[] }
grocery  : { groups: { id; title; items: Check[] }[] }
packing  : { todo: Check[]; people: { name; groups: { id; title; items: Check[] }[] }[] }
logistics: { sections: { title; rows: Row[] }[];
             tickets: { id; name; urgency: 'urgent'|'moderate'|'flexible'; body: Rich; link?: {label; href}; booked: boolean }[] }
costs    : { rows: { label: string; amount: string }[] }
```

`Rich` is rendered by one small component (no `dangerouslySetInnerHTML`); links must be `https:`. Cap each section at 200 KB.

Routes:

| Method | Path | Notes |
|---|---|---|
| GET | `/` | all trip metas, newest first. Client splits upcoming / current / past by date. |
| POST | `/` | `{name, destination, startDate, endDate, checkIn?, checkOut?, family: string[], copyListsFrom?: tripId}`. Builds the template: one `day-*` per date, packing with one person per family name plus "General", default grocery groups, empty dining meals (Breakfast, Lunch, Dinner), logistics sections (Stay, Amenities, Groceries, Party, To confirm), a default cost row set. `copyListsFrom` copies packing, todo and grocery from a past trip with everything unchecked. |
| GET | `/:id` | meta + every section in one query |
| PUT | `/:id/meta` | editing dates creates missing day sections; never deletes a day |
| PUT | `/:id/sections/:key` | body `{rev, data}`. Stale `rev` returns 409 with the current section. Bumps `rev`. Comment the get-then-put as `shortcut: not atomic, fine for one family; use a conditional write if edits ever collide`. |
| PUT | `/:id/import` | full trip (meta + all sections). 409 if the trip exists unless `?force=1`. Used by WP8 only. |

Client sync: react-query, `refetchInterval` 20s while the tab is visible, optimistic update, on 409 refetch and re-apply nothing (last server state wins, show a small "updated by someone else" toast).

Every day is editable the way Day 1 is in the artifact (add, edit, remove, reorder, reminders). "What's next" and the countdown are derived from `meta.checkIn/checkOut` and each event's `at`/`until`.

### 4.3 UI system

Reference: the "dashboard v22" image supplied by the owner. Frosted panels over a soft gradient field, left sidebar, compact stat cards, right rail.

Tokens to add in `tokens.css` (light, dark, and the `prefers-color-scheme` block, all three):

```
--field        page backdrop: layered radial gradients of --p-200/--cyan/--violet over --bg (light), --hero-glow/--hero-glow-2 over --bg (dark)
--glass-bg     color-mix(in oklab, var(--surface) 55%, transparent) light, 42% dark
--glass-bg-2   nested fill, no blur: color-mix(in oklab, var(--surface-2) 70%, transparent)
--glass-blur   20px
--glass-shadow 0 10px 30px -14px color-mix(in oklab, var(--p-500) 40%, transparent)
--radius-card 20px; --radius-ctl 14px; --rail-w 264px; --rail-w-mini 72px; --tab-h 64px
```

Primitives in `styles/glass.css`: `.glass` (exists, keep), `.glass-card` (the default card: `--glass-bg`, blur, border, lit rim), `.glass-row` (nested, **no backdrop-filter**), `.stat` (label, big number, trend, sparkline slot), `.rail`, `.segmented`. Redefine `.card` to be `.glass-card` so every existing page picks it up.

Rules:

- `backdrop-filter` only on shell chrome, sheets and top-level cards. Never on list rows or anything repeated more than about 8 times per screen (mobile GPU cost).
- Fallbacks: the existing `@supports not (backdrop-filter)` block, plus `@media (prefers-reduced-transparency: reduce)` switching `--glass-bg` to opaque `--surface`.
- Text on glass meets 4.5:1 in both themes. Check with the real backdrop behind it, not on white.
- Theme: `useTheme` already supports light, dark and system. Expose all three in the profile menu; keep the quick toggle. Add `<meta name="theme-color">` light and dark variants in `index.html`.

Layout:

| Width | Shell |
|---|---|
| 1024px and up | Fixed glass sidebar (`--rail-w`): wordmark, primary nav with the active module's sections expanded beneath it, family avatars at the bottom. Slim top bar: page title, theme toggle, avatar menu (theme mode, Family, Sign out). Content max 1200px; Home uses a main column plus a 320px right rail. |
| 768 to 1023px | Sidebar collapses to icons (`--rail-w-mini`). Right rail drops below the main column. |
| under 768px | No sidebar. Bottom glass tab bar: Home, Journal, Meals, Planner, More. "More" opens a sheet with every module (Health, Trips, Family) and theme + sign out. A module's sections are a horizontally scrolling segmented control under the page title. All editing happens in bottom sheets. |

Navigation is data-driven: extend `ModuleManifest` in `modules/registry.ts` with `sections?: {label, path, icon}[]` and `tab?: boolean`; Sidebar, TabBar and MoreSheet all read `MODULES`. Use `lucide-react` icons for new shell and ported pages; leave the existing `Icon` component and its callers alone.

Home dashboard (maps the reference layout onto real data):

- Row of stat cards: greeting card; next trip (name, days until check-in, or "Day 2 of 4"); Christmas (days to go, gifts bought x of y); health heads-up (existing `DashboardHeadsUp`).
- Main column: Glimmers (existing), This week (existing), Step challenge podium (existing), Log today (existing).
- Right rail: "Coming up" (next 3 trip events when a trip is active, otherwise upcoming birthdays from the planner's `FAMILY` list and planner to-dos due in 14 days), today's meal plan.
- The "Services" tile grid goes away; the sidebar and More sheet replace it.

## 5. Migration design

All scripts are `tsx` files in `scripts/`, read and write `migration/`, and take `--target local|aws`.

**Planner** (`scripts/migrate-planner.ts`):

1. `export`: full `Scan` of the old table to `migration/planner/export-<timestamp>.json`. Read-only.
2. `import --target local`: writes into the local MemoryDb file. `--target aws`: writes to `gravity-planner`. Refuses when the target table already has rows unless `--force`.
3. `verify`: re-reads the target and deep-equals every row (`JSON.parse(old.doc)` vs `new.doc`, key strings, row count, per-collection counts). Prints the table of counts from section 2. Non-zero exit on any difference.

Before the production import: confirm every email in the Christmas `ALLOWED_EMAILS` is in `/gravity/allowed-emails` (`npm run allowlist`), and every `priceTracker.email` in the export is too.

**Branson** (two steps, because phone data is involved):

1. *Collect.* Done on 2026-11-16, and confirmed with the owner: **no device holds list edits today.** The content to migrate is the page's built-in content (including the default packing, grocery, to-do, Saturday timeline, reminder and cost lists in its script) plus the `trip/costs` database rows. The artifact now also copies every `branson2026-*` localStorage key into `trip/device-<id>` on load and every 5 seconds, so any edits made between now and the final import are captured. Before the final import, re-read the `trip` collection with the `ArtifactData` tool into `migration/branson/artifact-db/`; if a device doc then holds more than `branson2026-costs-v1` and `branson2026-device-id`, pass it to the convert step, otherwise convert with defaults.
2. *Convert* (`scripts/export-branson.ts`): Playwright (already installed) opens `migration/branson/artifact.html` from disk, pre-loads localStorage from a chosen device file, overrides `branson2026-costs-v1` with the artifact-db rows (the db is the newer shared copy), lets the page's own script render, then extracts the DOM into the section shapes in 4.2 and writes `migration/branson/trip.json`. HTML `<strong>` and `<a>` become `Rich` markup. Event `at`/`until` come from `TRIP_EVENTS_RAW`, matched by day and title.
3. *Completeness check* in the same script: every non-empty visible text node in each `section[data-section]` must appear in the JSON for that section (whitespace-normalised). It prints counts (events per day, items per list, tickets, rows) and fails on any missing text.
4. If device files disagree on a list, the script prints the diff and stops. The owner picks the winner per list (`--prefer packing=lauren-phone`).
5. *Import* (`scripts/import-trip.ts`): validates `trip.json` with the zod schema and calls `PUT /api/trips/branson-2026/import`.

**Cutover order in production** (each line needs the owner's go-ahead):

1. Back up: on-demand DynamoDB backup of the old planner table; `export` as above.
2. `npm run deploy` (new tables are empty; existing Gravity data untouched).
3. Family stops using the old Christmas site. `export` again, `import --target aws`, `verify`.
4. Owner checks gifts, budget, birthday pages and feedback in Gravity.
5. Disable the old stack's price-check rule (or both sites email on a price drop) and its CloudFront distribution.
6. Branson: per D1, run collect, convert, import after the trip; owner compares against the artifact.

Rollback at any point: re-enable the old distribution and rule. Nothing was deleted.

## 6. Definition of done for every WP

- `npm run verify` is green. New behaviour has a vitest test; new screens have a Playwright test that runs in both the `desktop` and `mobile` projects.
- New e2e helper `expectNoOverflow(page)` (`scrollWidth <= innerWidth`) is called on every new or restyled route, in light and dark.
- No file outside the WP's "Owns" list is edited, except by adding to the registration points created in WP1.
- A `shortcut:` comment marks every known limit.
- Report at the end: what was built, what was not, test output, screenshots at 375x812 and 1280x800 in both themes for UI work.

## 7. Work packages

Dependency order: **WP0, WP1** serial. Then **WP2, WP3, WP4** in parallel. Then **WP5, WP6, WP7** in parallel (WP6 needs WP2+WP3, WP7 needs WP2+WP4). Then **WP8**, then **WP9**.

### WP0. Safety net (owner + one agent, 30 minutes)

- Create branch `consolidation` from `main` as it is. The uncommitted health work carries over in the working tree; leave it alone (owner's call).
- Read-only: confirm row counts in section 2 still hold.
- With go-ahead: on-demand backup of the old planner table; run nothing else in AWS.
- Confirm `migration/` is gitignored (already done) and holds `branson/artifact.html` and `branson/artifact-db/trip/costs.json`.

### WP1. Scaffold (serial, small)

Creates every shared registration point so later WPs never edit the same lines.

- `services/planner` and `services/trips`: `package.json`, `tsconfig.json`, `handler.ts`, and a `router.ts` with one `GET /ping` route each (copy `services/meals`).
- Wire both into `scripts/local-server.ts` (refactor the long ternary into a `[prefix, router]` table first), `tests/helpers.ts`, `infra/lib/gravity-stack.ts` (`new GravityService` x2; planner gets `timeout: 60s`), root `tsconfig.json` references.
- `tests/infra.test.ts`: assert the two new routes exist and are JWT-protected.
- `apps/web`: add `lucide-react`; add `planner` and `trips` to `MODULES`; add lazy routes `/app/planner/*` and `/app/trips/*` rendering a placeholder page from `modules/planner/index.tsx` and `modules/trips/index.tsx`.
- CSP `img-src` gains `https:` (D3), with the infra test updated.

### WP2. Design system and app shell

Owns: `styles/tokens.css`, `styles/base.css`, `styles/app.css`, new `styles/glass.css`, `components/shell/*`, `components/AppNav.tsx` (delete after replacement), `components/Sheet.tsx` (move from `modules/meals/Sheet.tsx`, update its imports), `modules/registry.ts` (shape only), `App.tsx` (`Protected` layout only), `index.html`, `e2e/nav.spec.ts`, `e2e/theme.spec.ts`, `e2e/helpers.ts`.

- Implement section 4.3: tokens, primitives, AppShell, Sidebar, TopBar, TabBar, MoreSheet, SubNav, three-state theme menu.
- Load the `impeccable` skill if available for the visual pass.
- Do not restyle module pages here beyond what the redefined `.card` gives for free.
- Tests: nav works on desktop and mobile; More sheet lists every module; theme persists across reload for light, dark and system; `expectNoOverflow` on every existing route.

### WP3. Planner service

Owns: `services/planner/src/*`, `packages/shared/src/planner.ts` (+ export line), `tests/planner.test.ts`, `tests/prices.test.ts`, the planner block in `gravity-stack.ts` (SES policy, `PRICE_ALERT_FROM`, schedule rule).

- Implement section 4.1. Read the three Python files and both Python test files in full first.
- `PRICE_ALERT_FROM` comes from `.env.local` through `infra/bin/gravity.ts`, like the Google client values. Add it to `.env.local.example`.
- Tests: the ported cases, plus 401 without a user, 403 for a non-family user, and the scheduled-event path.

### WP4. Trips service

Owns: `services/trips/src/*`, `packages/shared/src/trips.ts` (+ export line), `tests/trips.test.ts`.

- Implement section 4.2, including the template builder as a pure function in `packages/shared/src/trips.ts` with its own unit test.
- Tests: create from template (day count matches the date range, one packing person per family name), `copyListsFrom` unchecks everything, section PUT bumps `rev`, stale `rev` returns 409 and changes nothing, date edit adds days and keeps existing ones, import refuses to overwrite without `force`, oversize section is rejected, non-`https` link in `Rich` is rejected, 401 and 403.

### WP5. Restyle existing pages

Owns: `pages/Dashboard.tsx`, `pages/Landing.tsx`, `pages/Login.tsx`, `pages/Profiles.tsx`, `pages/*Page.tsx`, `styles/{health,journal,meals,landing}.css`, the CSS class usage inside `modules/{health,journal,meals}` (markup changes only where the layout needs them), their e2e specs.

- Apply the primitives from WP2. Build the Home dashboard from section 4.3. The trip and Christmas stat cards read `/api/trips` and `/api/planner/years` and render nothing when those return empty or error.
- No behaviour changes. Existing e2e specs keep passing with selector updates only.
- The uncommitted health work on `main` (ChallengePodium and friends) is the baseline; do not revert it.

### WP6. Planner web module

Owns: `apps/web/src/modules/planner/**`, `apps/web/src/styles/planner.css`, `e2e/planner.spec.ts`.

Source: `christmas-planner/frontend/src`. Port, do not rewrite.

- Bring over: `planner/*`, `pages/*` except `Landing.tsx`, `components/*` except `Sheet.tsx`, `lib/{format,backup}.ts`, `layout/{nav.ts,HelpSheet.tsx}`. Drop: `auth.tsx`, `lib/google.ts`, `lib/api.ts`, `Landing`, `landing.css`, `layout/AppShell.tsx`, `shell.css`, the PWA manifest and icons.
- `PlannerContext` stays as is, with `api` replaced by a 15-line wrapper over Gravity's `useFetcher` prefixed `/api/planner`, and `expire()` replaced by Gravity's existing 401 handling.
- From the old `AppShell`, re-home these features: year switcher, save-state indicator ("Saving / Saved / error"), Help sheet, Backup export and restore, PDF export, Snowfall and confetti, the birthday countdown strip. Put them in a planner header inside the module; navigation itself comes from `MODULES[].sections`.
- Fix every hard-coded path: 17 `to="/..."`/`navigate('/...')` call sites, `useOccasion` (`/app/birthday` becomes `/app/planner/birthday`), `/app/print`, `/start`.
- Feedback areas: keep the labels in sync with the list in the WP3 router.
- Styling: move the page CSS into `planner.css` nested under `.planner { }`. Delete rules for primitives Gravity already has (buttons, cards, chips, inputs, sheets) and make `components/ui.tsx` emit Gravity's classes. Map the old token names (`--pine-*`, `--cranberry-*`, `--gold-*`, `--cream-*`, `--ink-*`) to Gravity tokens in one alias block at the top of `.planner`, with a `[data-occasion='birthday']` variant, then delete the old `:root` blocks. `print.css` keeps a plain white print layout.
- `PrintView` renders outside the app shell chrome (hide sidebar and tab bar under `@media print` and on the print route).
- e2e, both projects: create a year from Setup; add, edit, filter and mark a gift purchased; price tracker "Check now" against the faked fetch; budget totals; birthday gifts and Yes Day; feedback add and complete; backup export then restore into an empty year; year switch.

### WP7. Trips web module

Owns: `apps/web/src/modules/trips/**`, `apps/web/src/styles/trips.css`, `e2e/trips.spec.ts`.

Feature parity with the artifact, for any trip. Use `migration/branson/artifact.html` as the behavioural spec (open it in a browser).

- Trips list: Current, Upcoming, Past (history). "New trip" sheet: name, destination, dates, check-in and check-out times, family members (pre-filled from `useMe().family`), optional "copy packing and grocery lists from" a past trip.
- Trip overview: countdown, "What's next" (before, during and after states, "Before you go" from `tbd` rows within 7 days), day glance cards, plan summary, party and stay.
- Day page: timeline with add, edit, remove, reorder, anchor badge, meta chips, per-event reminders, notes, info cards.
- Dining, Grocery (grouped checklists with count), Packing (to-do with progress, per-person groups, overall packed count), Logistics (sections, tickets with urgency badge and Booked toggle), Cost (rows, live total, add and remove).
- Text inputs save on blur or after a 600ms pause, checkboxes immediately. One mutation hook handles `rev`, optimistic update and the 409 path.
- Section nav comes from the trip's days plus the fixed sections (SubNav on mobile, sidebar children on desktop).
- e2e, both projects: create a trip, see the right number of days, add and reorder events, add a reminder, check packing items and see counts, add costs and see the total, toggle a ticket, reload and see everything persisted, a finished trip appears under Past and stays fully readable, a second browser context sees the first one's edit after refetch.

### WP-F. App-wide feedback (added 2026-11-16 at the owner's request)

Feedback moves out of the planner and becomes a Gravity feature covering every part of the site.

- Storage and API in the **core** service: `GET /api/core/feedback`, `PUT /api/core/feedback/:id`, `DELETE /api/core/feedback/:id`, rows at `pk: 'FEEDBACK'`, `sk: 'F#<id>'`. Same rules as the planner version (server-owned `createdAt`/`createdBy`/`doneAt`, 2000-character description, type Feature or Bug) except `area`: any trimmed string of 1-40 characters, because the list of areas belongs to the web app, not the server. No `occasion` field for new items.
- The area picker lists every major nav section from `NAV` in `components/shell/nav.ts` (Home, each non-`soon` module, Family) plus "Other". A new module added to `MODULES` appears automatically.
- One page at `/app/feedback`, reached from the account menu and the More sheet. Filter by area, type and open/done.
- Planner: its Feedback pages, routes, sections, the planner service's `/feedback` routes and the feedback constants are removed.
- Existing data: the 7 production feedback items (`HH#main` / `F#<id>` in the old planner table) migrate in WP8 to the core table with `area: 'Planner'`, `originalArea: <old area>` and `occasion: <old occasion>` kept, so nothing is lost. The page shows `originalArea` as a small tag when present.

### WP8. Migration tooling and local rehearsal

Owns: `scripts/migrate-planner.ts`, `scripts/export-branson.ts`, `scripts/import-trip.ts`, `tests/migrate.test.ts`, `package.json` script entries, a "Migration" section in `README.md`, the artifact export-button patch (as a diff for the owner to approve, not published by the agent).

- Implement section 5.
- Unit-test the planner row transform and the HTML-to-`Rich` conversion with fixtures that contain no real data.
- Rehearsal, all local: `export` from the old table (read-only), `import --target local`, `verify`, then open the planner in the local app and screenshot gifts, budget, birthday and feedback. Convert the Branson snapshot with defaults (no device files yet), import locally, and attach the completeness report and screenshots of every trip section.
- Deliver a runbook with the exact commands for section 5's cutover.

### WP9. Final verification, deploy and cutover

- Fresh clone, `npm ci`, `npm run verify`.
- Manual pass in the local app at 375x812 and 1280x800, light and dark, every route. Fix or file anything that overflows, is unreadable on glass, or has a tap target under 44px.
- `/code-review` and `/security-review` on the branch.
- `npm run synth`, diff the template: only additions (two tables, two functions, routes, one rule, CSP change). Any replacement or deletion of an existing resource stops the deploy.
- Then the cutover in section 5, one approved step at a time.
- Update `CLAUDE.md` (new services, shell, glass rules) and `README.md`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Branson trip starts 5 days after this plan was written | D1: the artifact stays live for the trip. Nothing about the trip depends on this project shipping. |
| Trip edits made on a phone before the final import are missed | The artifact backs every device up to its database automatically; the device docs are re-read right before the import, and the convert script stops on disagreement instead of guessing. |
| Stale writes to the old Christmas site after import | Old distribution disabled at cutover; the import refuses to overwrite a non-empty table. |
| Duplicate price-drop emails | Old EventBridge rule disabled in the same step that enables the new one. |
| Amazon blocks price checks from Lambda | Already true today; behaviour is ported unchanged, error shown on the gift. |
| Glass is slow or unreadable on phones | Blur budget rule, reduced-transparency fallback, contrast check in WP9. |
| CSS class collisions between the planner and Gravity | Planner CSS nested under `.planner`, primitives deleted in favour of Gravity's. |
| Kids' birthdates in `planner/family.ts` | Already in the Christmas source. If this repo is ever made public, move them into core profiles first. |
| No offline support for trips at a park with poor signal | Not in scope. The service worker caches the app shell only. Flagged for a follow-up if wanted. |
