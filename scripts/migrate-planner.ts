/**
 * Copy the old Christmas planner table into Gravity. Copy-only and re-runnable: nothing in the old table is touched.
 *   npm run migrate:planner -- export [--table <name>] [--region us-east-2]            read-only Scan -> migration/planner/export-<ts>.json
 *   npm run migrate:planner -- import --target local --db <file> [--export <file>] [--force]
 *   npm run migrate:planner -- import --target aws [--export <file>] [--force] --yes     writes gravity-planner + gravity-core
 *   npm run migrate:planner -- verify --target local --db <file> | --target aws [--export <file>]   exit 1 on any difference
 * --export defaults to the newest migration/planner/export-*.json.
 */
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { FEEDBACK_PK, MemoryDb, feedbackSk, plannerHouseholdPk, type Db, type Item } from '@gravity/shared/server';
import { DynamoDb } from '@gravity/shared/aws';

export const OLD_TABLE = 'christmas-planner-PlannerTable-8JH9WLMLD77X';
export const OLD_REGION = 'us-east-2';
const EXPORT_DIR = 'migration/planner';

/** A raw row of the old table: PK/SK upper case, `doc` a JSON string. */
export interface OldRow {
  PK: string;
  SK: string;
  doc: string;
  updatedBy?: string;
  updatedAt?: number;
}
export interface Rows {
  planner: Item[];
  core: Item[];
}

/** Pure. Planner rows keep their key strings and get a native `doc`; feedback rows go to the core table, re-tagged. */
export function transformPlanner(rows: OldRow[]): Rows {
  const out: Rows = { planner: [], core: [] };
  for (const r of rows) {
    const meta = { ...(r.updatedBy !== undefined ? { updatedBy: r.updatedBy } : {}), ...(r.updatedAt !== undefined ? { updatedAt: r.updatedAt } : {}) };
    const doc = JSON.parse(r.doc) as Record<string, unknown>;
    if (r.PK === plannerHouseholdPk() && r.SK.startsWith('F#')) {
      out.core.push({
        pk: FEEDBACK_PK,
        sk: feedbackSk(r.SK.slice(2)),
        doc: { ...doc, area: 'Planner', originalArea: doc.area, occasion: doc.occasion ?? 'Christmas' },
        ...meta,
      });
    } else out.planner.push({ pk: r.PK, sk: r.SK, doc, ...meta });
  }
  return out;
}

/** "settings", "feedback" or the collection name of an item row. */
export const kindOf = (pk: string, sk: string) => (sk.startsWith('I#') ? sk.split('#')[1]! : sk.startsWith('F#') ? 'feedback' : sk.startsWith('Y#') ? 'settings' : 'other:' + sk.split('#')[0]);
export function countByKind(rows: { pk: string; sk: string }[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of rows) c[kindOf(r.pk, r.sk)] = (c[kindOf(r.pk, r.sk)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
}

/** Pure. Every difference between what should be in the target and what is, as readable lines. Empty means identical. */
export function diffRows(expected: Rows, actual: Rows): string[] {
  const out: string[] = [];
  for (const table of ['planner', 'core'] as const) {
    const have = new Map(actual[table].map((r) => [r.pk + ' | ' + r.sk, r]));
    for (const e of expected[table]) {
      const k = e.pk + ' | ' + e.sk;
      const a = have.get(k);
      have.delete(k);
      if (!a) out.push(`[${table}] MISSING ${k}`);
      else if (!isDeepStrictEqual(a, e)) out.push(`[${table}] DIFFERENT ${k}\n   expected ${JSON.stringify(e).slice(0, 600)}\n   actual   ${JSON.stringify(a).slice(0, 600)}`);
    }
    for (const k of have.keys()) out.push(`[${table}] UNEXPECTED ${k}`);
  }
  const ec = JSON.stringify(countByKind([...expected.planner, ...expected.core]));
  const ac = JSON.stringify(countByKind([...actual.planner, ...actual.core]));
  if (ec !== ac) out.push(`counts differ\n   expected ${ec}\n   actual   ${ac}`);
  return out;
}

// ---- Targets --------------------------------------------------------------------------------------------------
interface Target {
  db: Db;
  planner: string;
  core: string;
  label: string;
}
function openTarget(a: Args): Target {
  if (a.target === 'local') {
    if (!a.db) fail('--db <file> is required for --target local');
    return { db: new MemoryDb(a.db), planner: 'planner', core: 'core', label: 'local ' + a.db };
  }
  if (a.target === 'aws') return { db: new DynamoDb(), planner: 'gravity-planner', core: 'gravity-core', label: 'AWS tables gravity-planner + gravity-core' };
  return fail('--target must be local or aws');
}

/** Everything in the target that this migration owns: HH#main rows, every year partition, and the feedback rows. */
async function readTarget(t: Target, years: string[]): Promise<Rows> {
  const pks = new Set([plannerHouseholdPk(), ...years]);
  for (const r of await t.db.query(t.planner, plannerHouseholdPk(), 'Y#')) pks.add(plannerHouseholdPk() + '#' + r.sk);
  const planner: Item[] = [];
  for (const pk of pks) planner.push(...(await t.db.query(t.planner, pk)));
  return { planner, core: await t.db.query(t.core, FEEDBACK_PK, 'F#') };
}
const yearPartitions = (rows: Rows) => [...new Set(rows.planner.map((r) => r.pk))];

// ---- CLI ------------------------------------------------------------------------------------------------------
export interface Args {
  cmd: string;
  target?: string;
  db?: string;
  export?: string;
  table: string;
  region: string;
  force: boolean;
  yes: boolean;
}
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] ?? '', table: OLD_TABLE, region: OLD_REGION, force: false, yes: false };
  for (let i = 1; i < argv.length; i++) {
    const f = argv[i]!;
    const v = () => argv[++i] ?? fail(f + ' needs a value');
    if (f === '--target') a.target = v();
    else if (f === '--db') a.db = v();
    else if (f === '--export') a.export = v();
    else if (f === '--table') a.table = v();
    else if (f === '--region') a.region = v();
    else if (f === '--force') a.force = true;
    else if (f === '--yes') a.yes = true;
    else fail('Unknown option ' + f);
  }
  return a;
}
const loadExport = (a: Args): { file: string; rows: OldRow[] } => {
  const file = a.export ?? (readdirSync(EXPORT_DIR).filter((f) => /^export-.*\.json$/.test(f)).sort().pop() ?? fail('No export found; run export first'));
  const path = a.export ?? EXPORT_DIR + '/' + file;
  return { file: path, rows: JSON.parse(readFileSync(path, 'utf8')) as OldRow[] };
};

function printCounts(title: string, rows: { pk: string; sk: string }[]) {
  const byPk: Record<string, number> = {};
  for (const r of rows) byPk[r.pk.replace(/#Y#\d+$/, '#Y#<year>')] = (byPk[r.pk.replace(/#Y#\d+$/, '#Y#<year>')] ?? 0) + 1;
  console.log(`${title}: ${rows.length} rows`);
  console.log('  per partition:', JSON.stringify(byPk));
  console.table(countByKind(rows));
}

async function exportOld(a: Args) {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: a.region }));
  const rows: OldRow[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await doc.send(new ScanCommand({ TableName: a.table, ExclusiveStartKey, ConsistentRead: true }));
    rows.push(...((r.Items ?? []) as OldRow[]));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  rows.sort((x, y) => (x.PK + '|' + x.SK).localeCompare(y.PK + '|' + y.SK));
  mkdirSync(EXPORT_DIR, { recursive: true });
  const file = `${EXPORT_DIR}/export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(rows, null, 1));
  console.log(`Exported ${rows.length} rows from ${a.table} to ${file}`);
  const t = transformPlanner(rows);
  printCounts('planner table', t.planner.map((r) => ({ pk: r.pk, sk: r.sk })));
  printCounts('feedback', t.core.map((r) => ({ pk: r.pk, sk: r.sk })));
  const emails = new Set<string>();
  for (const r of t.planner) {
    const e = (r.doc as { priceTracker?: { email?: string } }).priceTracker?.email;
    if (e) emails.add(e.toLowerCase());
  }
  console.log('priceTracker emails that must be on the Gravity allowlist:', [...emails].join(', ') || '(none)');
}

export async function importRows(a: Args) {
  const { file, rows } = loadExport(a);
  const t = openTarget(a);
  const next = transformPlanner(rows);
  const existing = await readTarget(t, yearPartitions(next));
  console.log(`Export ${file}: ${rows.length} rows -> ${next.planner.length} planner rows + ${next.core.length} feedback rows (core) into ${t.label}`);
  // Planner rows and feedback are guarded separately: app-wide feedback filed after deploy must not force an overwrite of planner data.
  const haveFeedback = new Set(existing.core.map((r) => r.sk));
  const clash = next.core.filter((r) => haveFeedback.has(r.sk)).length;
  if (!a.force && (existing.planner.length || clash))
    fail(`Target already has ${existing.planner.length} planner rows and ${clash} of the incoming feedback ids. Nothing written. Use --force to overwrite.`);
  if (a.target === 'aws' && !a.yes) fail('Not writing to AWS without --yes. Review the line above, then re-run with --yes.');
  for (const r of next.planner) await t.db.put(t.planner, r);
  for (const r of next.core) await t.db.put(t.core, r);
  console.log(`Wrote ${next.planner.length + next.core.length} rows. Now run verify.`);
}

async function verify(a: Args) {
  const { file, rows } = loadExport(a);
  const t = openTarget(a);
  const expected = transformPlanner(rows);
  const actual = await readTarget(t, yearPartitions(expected));
  const diffs = diffRows(expected, actual);
  console.log(`Verify ${t.label} against ${file}`);
  console.table(
    Object.fromEntries(
      Object.entries({ ...countByKind([...expected.planner, ...expected.core]) }).map(([k, n]) => [k, { export: n, target: countByKind([...actual.planner, ...actual.core])[k] ?? 0 }]),
    ),
  );
  console.log(`Total: export ${rows.length}, target ${actual.planner.length + actual.core.length}`);
  if (diffs.length) {
    console.error(`FAILED: ${diffs.length} difference(s)\n` + diffs.join('\n'));
    process.exit(1);
  }
  console.log('OK: every row, key and count matches.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const cmds: Record<string, (a: Args) => Promise<void>> = { export: exportOld, import: importRows, verify };
  await (cmds[a.cmd] ?? (() => fail('Usage: migrate-planner export | import | verify (see file header)')))(a);
}
