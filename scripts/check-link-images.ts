// Live check of gift photo lookup against real links, through the exact server code path (SSRF guard, redirects,
// Amazon handling, image extraction). Prints every hop so a failure shows where it broke. Makes real GET requests.
//   npx tsx scripts/check-link-images.ts <url> [url...]
//   npx tsx scripts/check-link-images.ts --file <json> [--limit N]   (scans a JSON file for Amazon links)
import fs from 'node:fs';
import { createHttpFetcher, fetchImage, fetchPrice } from '../services/planner/src/prices';

const args = process.argv.slice(2);
let urls = args.filter((a) => /^https?:\/\//.test(a));
const fi = args.indexOf('--file');
if (fi >= 0) {
  const text = fs.readFileSync(args[fi + 1]!, 'utf8');
  urls = [...new Set(text.match(/https?:\/\/(?:[a-z0-9-]+\.)*(?:amazon\.[a-z.]+|a\.co|amzn\.to|amzn\.com)\/[^"\\\s]*/gi) ?? [])];
}
const li = args.indexOf('--limit');
if (li >= 0) urls = urls.slice(0, Number(args[li + 1]));

let hops: string[] = [];
const logged: typeof fetch = async (input, init) => {
  const r = await fetch(input, init);
  hops.push(`${r.status} ${String(input).slice(0, 90)}`);
  return r;
};
const get = createHttpFetcher({ fetchImpl: logged });

let ok = 0;
for (const url of urls) {
  hops = [];
  const t = Date.now();
  let image: string | null = null, price: number | null = null, err = '';
  try {
    image = await fetchImage(url, get);
  } catch (e) {
    err = (e as Error).message;
  }
  try {
    price = await fetchPrice(url, get);
  } catch {
    /* price is informational here */
  }
  if (image) ok++;
  console.log(`${image ? 'OK  ' : 'FAIL'} ${url}  (${Date.now() - t} ms)\n     image: ${image ?? '-'}${err ? `\n     error: ${err}` : ''}\n     price: ${price ?? '-'}\n     hops:  ${hops.join('\n            ')}`);
  await new Promise((r) => setTimeout(r, 800)); // be gentle with the store
}
console.log(`\n${ok}/${urls.length} found a photo`);
