/**
 * Import a trip JSON (from export-branson.ts) through the real trips import route, so the rows are exactly what the API writes.
 *   npm run migrate:trip-import -- --target local --db <file> [--file migration/branson/trip.json] [--force]
 *   npm run migrate:trip-import -- --target aws [--file ...] [--force] --yes     writes gravity-trips with your AWS credentials
 * Refuses to replace an existing trip unless --force (the route's own 409).
 */
import { readFileSync } from 'node:fs';
import { MemoryDb, tripImport } from '@gravity/shared/server';
import { DynamoDb } from '@gravity/shared/aws';
import { buildTripsRouter } from '../services/trips/src/router';

const args = process.argv.slice(2);
const arg = (n: string) => (args.indexOf('--' + n) >= 0 ? args[args.indexOf('--' + n) + 1] : undefined);
const fail = (m: string): never => {
  console.error(m);
  process.exit(1);
};

const file = arg('file') ?? 'migration/branson/trip.json';
const body = tripImport.parse(JSON.parse(readFileSync(file, 'utf8')));
const target = arg('target');
if (target !== 'local' && target !== 'aws') fail('--target must be local or aws');
if (target === 'local' && !arg('db')) fail('--db <file> is required for --target local');
const table = target === 'aws' ? 'gravity-trips' : 'trips';
console.log(`Importing ${file}: trip ${body.meta.id}, ${Object.keys(body.sections).length} sections into ${target === 'aws' ? 'AWS table ' + table : 'local ' + arg('db')}`);
if (target === 'aws' && !args.includes('--yes')) fail('Not writing to AWS without --yes. Review the line above, then re-run with --yes.');

const user = { sub: 'migration', email: 'migration@gravity.local', name: 'Migration' };
const router = buildTripsRouter({ db: target === 'aws' ? new DynamoDb() : new MemoryDb(arg('db')), table, allowlist: async () => [user.email] });
const res = await router({ method: 'PUT', path: `/api/trips/${body.meta.id}/import`, query: args.includes('--force') ? { force: '1' } : {}, body, user });
if (res.status !== 200) fail(`Import failed (${res.status}): ${JSON.stringify(res.body)}`);
console.log('OK: imported ' + body.meta.id);
