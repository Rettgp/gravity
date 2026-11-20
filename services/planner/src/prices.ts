/** Gift price tracking: fetch a product page price, compare it to the baseline and email on a drop. Port of prices.py. */
import dns from 'node:dns';
import net from 'node:net';
import { PLANNER_GIFT_COLLECTIONS, isAllowed } from '@gravity/shared/server';
import type { Doc, PlannerStore } from './store.js';

// Tracker docs are free-form JSON from the client until merged.
type Loose = Record<string, any>;

const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 8000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** A failure with a message that is safe to show to the user. */
export class PriceError extends Error {
  /** Set when the last hop answered with an error status, so callers can still use where the redirects ended. */
  finalUrl?: string;
  /** A passing failure (the store refused this once): the app should ask again later rather than give up. */
  retryable?: boolean;
}

export type FetchPage = (url: string) => Promise<{ html: string; finalUrl: string }>;
export type SendEmail = (msg: { to: string; subject: string; body: string }) => Promise<void>;
export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;

// ---- SSRF guard -----------------------------------------------------------------------------------------------------

// Not globally routable (IANA special-purpose registry). Everything else in IPv4 is public.
const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4ToInt = (a: string) => a.split('.').reduce((n, p) => n * 256 + Number(p), 0);
const v4Public = (a: string) => {
  const n = v4ToInt(a);
  return !V4_BLOCKED.some(([base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(v4ToInt(base) / 2 ** (32 - bits)));
};

const v6Groups = (addr: string): number[] => {
  let a = addr.split('%')[0]!;
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (dotted) {
    const n = v4ToInt(dotted[2]!);
    a = dotted[1]! + (n >>> 16).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  const halves = a.split('::');
  const parse = (s: string) => (s ? s.split(':').map((h) => parseInt(h, 16)) : []);
  const head = parse(halves[0]!);
  if (halves.length === 1) return head;
  const tail = parse(halves[1]!);
  return [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail];
};

/** Allow-list: only global unicast 2000::/3, minus the special ranges inside it. Rejects ::, ::1, ::ffff:a.b.c.d (IPv4-mapped), fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96. */
const v6Public = (addr: string) => {
  const [g0 = 0, g1 = 0] = v6Groups(addr);
  if ((g0 & 0xe000) !== 0x2000) return false;
  if (g0 === 0x2001 && (g1 < 0x200 || g1 === 0xdb8)) return false; // protocol assignments, Teredo, ORCHID, documentation
  if (g0 === 0x2002) return false; // 6to4 embeds an IPv4 address
  if (g0 === 0x3fff && g1 < 0x1000) return false; // documentation
  return true;
};

export const isPublicIp = (addr: string) => {
  const v = net.isIP(addr);
  return v === 4 ? v4Public(addr) : v === 6 ? v6Public(addr) : false;
};

const defaultLookup: Lookup = (host) => dns.promises.lookup(host, { all: true });

export async function checkUrl(url: string, lookup: Lookup = defaultLookup) {
  let u: URL | undefined;
  try {
    u = new URL(url);
  } catch {
    /* handled below */
  }
  if (!u || !u.hostname || (u.protocol !== 'http:' && u.protocol !== 'https:')) throw new PriceError('Only http(s) links can be tracked');
  let addresses: { address: string }[];
  try {
    addresses = await lookup(u.hostname.replace(/^\[|\]$/g, ''));
  } catch {
    throw new PriceError("Couldn't reach that website");
  }
  // shortcut: DNS is resolved again when connecting (rebinding), so this isn't airtight; pin the IP if that matters.
  if (!addresses.length || !addresses.every((a) => isPublicIp(a.address))) throw new PriceError("That link doesn't point to a public website");
}

const readCapped = async (resp: Response) => {
  const reader = resp.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= MAX_PAGE_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, MAX_PAGE_BYTES);
};

/** The real page fetcher. Every hop (first URL and each redirect) is checked before it is requested. */
export function createHttpFetcher({ lookup = defaultLookup, fetchImpl = fetch }: { lookup?: Lookup; fetchImpl?: typeof fetch } = {}): FetchPage {
  return async (start) => {
    let url = start;
    for (let hop = 0; ; hop++) {
      await checkUrl(url, lookup);
      let resp: Response;
      try {
        resp = await fetchImpl(url, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        throw new PriceError("Couldn't load that page");
      }
      const location = resp.headers.get('location');
      if ([301, 302, 303, 307, 308].includes(resp.status) && location) {
        await resp.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECTS) throw new PriceError("Couldn't load that page");
        try {
          url = new URL(location, url).href;
        } catch {
          throw new PriceError("Couldn't load that page");
        }
        continue;
      }
      if (!resp.ok) {
        await resp.body?.cancel().catch(() => {});
        throw Object.assign(new PriceError(`The store returned an error (HTTP ${resp.status})`), { finalUrl: url });
      }
      try {
        const charset = /charset=["']?([^;"'\s]+)/i.exec(resp.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
        return { html: new TextDecoder(charset).decode(await readCapped(resp)), finalUrl: url };
      } catch {
        throw new PriceError("Couldn't load that page");
      }
    }
  };
}

// ---- Amazon -----------------------------------------------------------------------------------------------------------

const AMAZON_HOST = /(?:^|\.)(amazon\.[a-z.]+)$/;
const AMAZON_SHORT = /(?:^|\.)(?:amzn\.to|a\.co|amzn\.com)$/;
const ASIN = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/;
const AMAZON_PRICE = /apex-pricetopay-value[^>]*>\s*<span class="a-offscreen">([^<]*)<|twister-plus-price-data-price" value="([\d.,]+)"/;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/** [host, asin] for a product link on an Amazon store, else null. */
export const amazon = (url: string): [string, string] | null => {
  const asin = ASIN.exec(url);
  const store = AMAZON_HOST.exec(hostOf(url));
  return asin && store ? [store[1]!, asin[1]!] : null;
};

export const amazonPrice = (html: string) => {
  const m = AMAZON_PRICE.exec(html);
  return toNumber(m && (m[1] || m[2]));
};

/** [html, finalUrl, isAmazon] for a product link. */
async function productPage(url: string, get: FetchPage): Promise<[string, string, boolean]> {
  let a = amazon(url);
  if (!a && AMAZON_SHORT.test(hostOf(url))) {
    // Follow amzn.to / a.co to the product page to learn its ASIN. Amazon often answers bots with an error status
    // (503) on that page; the redirects still ended at the product URL, so use it.
    const landed = await get(url).then((p) => p.finalUrl, (e) => { if (e instanceof PriceError && e.finalUrl) return e.finalUrl; throw e; });
    a = amazon(landed);
  }
  if (a) {
    // Amazon's desktop product page serves bots a CAPTCHA, but its mobile page has the full price.
    // shortcut: relies on Amazon's markup and may break or get blocked from AWS IPs; run the check from a home PC if it does.
    const page = await get(`https://${a[0]}/gp/aw/d/${a[1]}`);
    return [page.html, page.finalUrl, true];
  }
  const page = await get(url);
  return [page.html, page.finalUrl, false];
}

export async function fetchPrice(url: string, get: FetchPage) {
  const [html, , isAmazon] = await productPage(url, get);
  let price: number | null;
  if (isAmazon) {
    price = amazonPrice(html);
    if (price === null && html.toLowerCase().includes('captcha')) throw new PriceError('Amazon blocked this check; it will try again later');
    if (price === null && html.toLowerCase().includes('currently unavailable')) throw new PriceError('Amazon shows this item as currently unavailable');
  } else {
    price = extractPrice(html);
  }
  if (price === null) throw new PriceError("Couldn't find a price on this page");
  return price;
}

// ---- HTML reading (no parser dependency) ----------------------------------------------------------------------

const MAX_PARSE_CHARS = 512 * 1024;
const RAW_OPEN = /<(script|style)\b/gi;
const CLOSE = { script: /<\/script/gi, style: /<\/style/gi };
// One quantifier and no quotes, so it is linear on hostile input. A '>' inside a quoted attribute value ends the tag early (fine for meta/itemprop tags).
const TAG = /<[a-zA-Z][^<>]*>/g;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const unescapeHtml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase() as 'amp'];
  });

const attrs = (src: string) => {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(ATTR)) out[m[1]!.toLowerCase()] = unescapeHtml(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
};

/** JSON-LD script bodies, and the first `content` of each meta tag (or itemprop="price" tag) by property/name/itemprop. */
function parsePage(html: string) {
  const jsonLd: string[] = [];
  const meta: Record<string, string> = {};
  // Hostile pages must not hang the Lambda: cap the size, and cut <script>/<style> with linear scans (tags inside them are text).
  html = html.slice(0, MAX_PARSE_CHARS);
  let rest = '';
  for (let at = 0; ; ) {
    RAW_OPEN.lastIndex = at;
    const open = RAW_OPEN.exec(html);
    const tagEnd = open ? html.indexOf('>', open.index) : -1;
    const kind = open?.[1]!.toLowerCase() as 'script' | 'style' | undefined;
    let close: RegExpExecArray | null = null;
    if (kind && tagEnd >= 0) {
      CLOSE[kind].lastIndex = tagEnd + 1;
      close = CLOSE[kind].exec(html);
    }
    const closeEnd = close ? html.indexOf('>', close.index) : -1;
    if (!kind || closeEnd < 0) {
      rest += html.slice(at); // no further complete script/style block
      break;
    }
    rest += html.slice(at, open!.index);
    if (kind === 'script' && attrs(html.slice(open!.index + 7, tagEnd)).type?.toLowerCase() === 'application/ld+json') jsonLd.push(html.slice(tagEnd + 1, close!.index));
    at = closeEnd + 1;
  }
  for (const m of rest.matchAll(TAG)) {
    const name = /^<[^\s/>]*/.exec(m[0])![0];
    if (!/^<meta$/i.test(name) && !m[0].includes('itemprop')) continue;
    const a = attrs(m[0].slice(name.length, -1));
    const key = a.property || a.name || a.itemprop;
    if (a.content !== undefined && key && (/^<meta$/i.test(name) || a.itemprop === 'price') && !(key in meta)) meta[key] = a.content;
  }
  return { jsonLd, meta };
}

// Python truthiness for the JSON values the tracker code tests (null, 0, '', [] and {} are all falsy).
const truthy = (v: unknown) => !!v && !(typeof v === 'object' && Object.keys(v).length === 0);

export function toNumber(value: unknown): number | null {
  let n: unknown = value;
  if (typeof value === 'string') {
    const m = /\d[\d,]*(?:\.\d+)?|\.\d+/.exec(value);
    n = m ? parseFloat(m[0].replace(/,/g, '')) : null;
  }
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function* products(node: unknown): Generator<Loose> {
  if (Array.isArray(node)) {
    for (const item of node) yield* products(item);
  } else if (node && typeof node === 'object') {
    const n = node as Loose;
    if ((Array.isArray(n['@type']) ? n['@type'] : [n['@type']]).includes('Product')) yield n;
    yield* products(n['@graph'] ?? []);
  }
}

export function extractPrice(html: string): number | null {
  // shortcut: sites that block bots or render prices with JS (often Amazon) can't be read; upgrade to a paid price API if that matters.
  const page = parsePage(html);
  for (const text of page.jsonLd) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    for (const product of products(data)) {
      const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
      for (const offer of offers) {
        if (offer && typeof offer === 'object' && !Array.isArray(offer)) {
          const price = toNumber(offer.price) ?? toNumber(offer.lowPrice);
          if (price) return price;
        }
      }
    }
  }
  for (const key of ['product:price:amount', 'og:price:amount', 'price']) {
    const price = toNumber(page.meta[key]);
    if (price) return price;
  }
  return null;
}

// Amazon's own markers for the main product photo, best first. The page holds dozens of other product-CDN images
// (ads, related items, banners), so never take "the first image on the page": a wrong photo is worse than none.
// shortcut: depends on Amazon's markup; if they rename these, gifts fall back to the placeholder until updated.
const AMAZON_MAIN_IMAGE = [
  /data-old-hires="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
  /"hiRes":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
  /"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
  /id="landingImage"[^>]*?\ssrc="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
  /data-a-dynamic-image="\{&quot;(https:\/\/m\.media-amazon\.com\/images\/I\/[^&]+)&quot;/,
];

/** Absolute http(s) URL of the product photo, or null. */
export function extractImage(html: string, baseUrl: string): string | null {
  const page = parsePage(html);
  const isAmazon = AMAZON_HOST.test(hostOf(baseUrl));
  const candidates: unknown[] = isAmazon ? AMAZON_MAIN_IMAGE.map((re) => re.exec(html)?.[1]) : [];
  candidates.push(...['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'].map((k) => page.meta[k]));
  for (const text of page.jsonLd) {
    let list: Loose[];
    try {
      list = [...products(JSON.parse(text))];
    } catch {
      continue;
    }
    for (const product of list) {
      let img = product.image;
      if (Array.isArray(img) && img.length) img = img[0];
      candidates.push(img && typeof img === 'object' && !Array.isArray(img) ? img.url : img);
    }
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      try {
        const url = new URL(c.trim(), baseUrl);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      } catch {
        /* unusable candidate: try the next */
      }
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bot walls that answer 200 instead of the product (Sam's Club / Walmart's "blocked - redirecting", PerimeterX,
// Akamai, Imperva). Real product pages can mention "captcha" in their scripts, so the bare words only count on a tiny page.
const BOT_WALL = /blocked - redirecting|px-captcha|Robot or human\?|Pardon Our Interruption|<title>Access Denied<\/title>/i;
const TINY_WALL = /blocked|captcha|access denied|are you a robot/i;
export const isBotWall = (html: string) => BOT_WALL.test(html.slice(0, 64 * 1024)) || (html.length < 5000 && TINY_WALL.test(html));

/** Product photo for a gift link. Amazon, and any store that sends a bot wall instead of the product, gets a second
 *  try; a miss after that is reported as retryable rather than "this link has no photo", so the app asks again on a
 *  later visit instead of remembering a blank forever. */
export async function fetchImage(url: string, get: FetchPage, pause: (ms: number) => Promise<unknown> = sleep) {
  const amazonLink = amazon(url) !== null || AMAZON_SHORT.test(hostOf(url));
  let walled = false;
  for (let attempt = 0; ; attempt++) {
    try {
      const [html, finalUrl, isAmazon] = await productPage(url, get);
      const image = extractImage(html, finalUrl);
      walled = !image && isBotWall(html);
      if (image || !(isAmazon || amazonLink || walled)) return image;
    } catch (e) {
      if (!(amazonLink && e instanceof PriceError)) throw e;
    }
    if (attempt === 1) {
      const msg = amazonLink ? "Amazon didn't send the product page this time; it will try again later" : 'The store blocked the photo lookup this time; it will try again later';
      // Host only (no full link): enough to see which stores block the server.
      console.warn('link-image: no product page', hostOf(url), walled ? 'bot wall' : 'error or missing photo');
      throw Object.assign(new PriceError(msg), { retryable: true });
    }
    await pause(800);
  }
}

// ---- Tracker ----------------------------------------------------------------------------------------------------------

/** Keep the server-owned tracker fields from the stored gift; only `pct` comes from the client. Throws RangeError for a bad pct. */
export function mergeTracker(doc: Loose, stored: Loose | null, userEmail: string) {
  const tracker = doc.priceTracker;
  if (!truthy(tracker) || !truthy(doc.link)) {
    delete doc.priceTracker;
    return doc;
  }
  const pct = typeof tracker === 'object' ? tracker.pct : undefined;
  if (typeof pct !== 'number' || !(pct >= 1 && pct <= 99)) throw new RangeError('pct out of range');
  // A different link means a different product, so start fresh.
  const prev: Loose = (stored?.link === doc.link ? stored?.priceTracker : null) || {};
  doc.priceTracker = {
    pct,
    email: prev.email || userEmail,
    basePrice: prev.basePrice ?? null,
    lastPrice: prev.lastPrice ?? null,
    checkedAt: prev.checkedAt ?? null,
    notifiedAt: prev.pct === pct ? (prev.notifiedAt ?? null) : null, // a new % re-arms the alert
    error: prev.error ?? null,
  };
  return doc;
}

/** Refresh the tracker in place; true when a price-drop email should be sent. */
export async function checkGift(gift: Loose, fetch: (url: string) => Promise<number>, now = Date.now()) {
  const tracker = gift.priceTracker as Loose;
  let price: number;
  try {
    price = await fetch(String(gift.link));
  } catch (e) {
    if (!(e instanceof PriceError)) throw e;
    Object.assign(tracker, { error: e.message, checkedAt: now });
    return false;
  }
  Object.assign(tracker, { lastPrice: price, checkedAt: now, error: null });
  tracker.basePrice ??= price;
  const base = tracker.basePrice as number;
  if ((tracker.notifiedAt ?? null) === null && base > 0 && ((base - price) / base) * 100 >= tracker.pct) {
    tracker.notifiedAt = now;
    return true;
  }
  return false;
}

export interface PriceCtx {
  store: PlannerStore;
  allowlist: () => Promise<string[]>;
  fetchPage: FetchPage;
  sendEmail: SendEmail;
  now: () => Date;
}

const money = (currency: string, v: number) => `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function sendAlert(gift: Loose, currency: string, { allowlist, sendEmail }: Pick<PriceCtx, 'allowlist' | 'sendEmail'>) {
  const tracker = gift.priceTracker as Loose;
  // A hidden gift's alert goes only to the person who hid it.
  const to = String(gift.hiddenBy || tracker.email || '').toLowerCase();
  if (!isAllowed(to, await allowlist())) return;
  const [base, last] = [tracker.basePrice as number, tracker.lastPrice as number];
  const subject = `Price drop: ${gift.idea ?? ''} is now ${money(currency, last)}`.replace(/\s+/g, ' ').trim();
  const body =
    `Product: ${gift.idea ?? ''}\nFor: ${gift.recipient ?? ''}\nCurrent price: ${money(currency, last)}\n` +
    `Original price: ${money(currency, base)}\nDrop: ${(((base - last) / base) * 100).toFixed(1)}%\nLink: ${gift.link}\n`;
  await sendEmail({ to, subject, body });
}

/** Local-mode mail: print it. */
export const logEmail: SendEmail = async ({ to, subject, body }) => console.log(`[price alert] To: ${to}\nSubject: ${subject}\n\n${body}`);

export async function checkAndSave(ctx: PriceCtx, year: number, gift: Loose, collection = 'gifts') {
  if (truthy(gift.priceTracker) && truthy(gift.link)) {
    if (await checkGift(gift, (url) => fetchPrice(url, ctx.fetchPage), ctx.now().getTime())) {
      try {
        await sendAlert(gift, ((await ctx.store.getSettings(year)) as Loose | null)?.currency || 'USD', ctx);
      } catch (e) {
        console.error(e); // leave the alert armed so the next check retries
        gift.priceTracker.notifiedAt = null;
      }
    }
    // The page fetch is slow: re-read so edits made meanwhile survive, and only the tracker is replaced. A gift deleted or re-linked meanwhile is left alone.
    const fresh = await ctx.store.getItem(year, collection, String(gift.id));
    if (!fresh || fresh.link !== gift.link) return fresh ?? gift;
    const merged = { ...fresh, priceTracker: gift.priceTracker } as Doc;
    await ctx.store.putItem(year, collection, String(gift.id), merged, 'price-tracker');
    return merged;
  }
  return gift;
}

export async function runScheduled(ctx: PriceCtx) {
  const jobs: [number, Loose, string][] = [];
  for (const { year } of await ctx.store.listYears()) {
    const all = await ctx.store.listItems(year);
    for (const c of PLANNER_GIFT_COLLECTIONS) {
      for (const g of (all[c] ?? []) as Loose[]) if (truthy(g.priceTracker) && truthy(g.link) && !g.purchased) jobs.push([year, g, c]);
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      try {
        await checkAndSave(ctx, job[0], job[1], job[2]);
      } catch (e) {
        console.error(e); // one bad gift must not stop the rest
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, worker));
  return { checked: jobs.length };
}
