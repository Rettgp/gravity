import net from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { MemoryDb } from '@gravity/shared/server';
import { FAMILY, makeApp } from './helpers';
import {
  PriceError,
  amazon,
  amazonPrice,
  checkAndSave,
  checkGift,
  checkUrl,
  createHttpFetcher,
  extractImage,
  fetchImage,
  extractPrice,
  fetchPrice,
  isPublicIp,
  logEmail,
  mergeTracker,
  sendAlert,
  type FetchPage,
} from '../services/planner/src/prices';
import { plannerStore } from '../services/planner/src/store';

const ld = (data: unknown) => `<html><script type="application/ld+json">${JSON.stringify(data)}</script></html>`;
const page = (price: number | string) => ld({ '@type': 'Product', offers: { price } });

describe('prices: extractPrice', () => {
  it.each<[string, string, number | null]>([
    ['offer price', ld({ '@type': 'Product', offers: { '@type': 'Offer', price: '19.99' } }), 19.99],
    ['first of an offer list', ld({ '@type': 'Product', offers: [{ price: 5 }, { price: 7 }] }), 5],
    ['lowPrice', ld({ '@type': 'Product', offers: { '@type': 'AggregateOffer', lowPrice: '8.50', highPrice: '20' } }), 8.5],
    ['@graph with a type list', ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, { '@type': ['Thing', 'Product'], offers: { price: 42 } }] }), 42],
    ['array root, currency sign', ld([{ '@type': 'Product', offers: { price: '$12.34' } }]), 12.34],
    ['thousands separator', ld({ '@type': 'Product', offers: { price: '1,299.99' } }), 1299.99],
    ['og:price:amount', '<meta property="og:price:amount" content="33.10">', 33.1],
    ['product:price:amount wins over og', '<meta property="product:price:amount" content="9"><meta property="og:price:amount" content="33">', 9],
    ['itemprop price', '<span itemprop="price" content="14.5">$14.50</span>', 14.5],
    ['broken JSON-LD falls through to meta', '<script type="application/ld+json">{oops</script><meta property="og:price:amount" content="3">', 3],
    ['no price', '<html><body>No price here</body></html>', null],
    ['zero is no price', ld({ '@type': 'Product', offers: { price: '0' } }), null],
    ['single quotes, entities, odd casing', "<META NAME='price' CONTENT='1&#44;050.5'>", 1050.5],
    ['a meta tag inside a script is just text', '<script>var x = \'<meta name="price" content="5">\'</script>', null],
  ])('%s', (_name, html, expected) => {
    expect(extractPrice(html)).toBe(expected);
  });
});

describe('prices: extractImage', () => {
  it.each<[string, string | null]>([
    ['<meta property="og:image" content="https://cdn.shop.com/a.jpg">', 'https://cdn.shop.com/a.jpg'],
    ['<meta property="og:image" content="/img/a.jpg">', 'https://shop.com/img/a.jpg'],
    ['<meta property="og:image" content="https://x.com/a.jpg?w=1&amp;h=2">', 'https://x.com/a.jpg?w=1&h=2'],
    ['<meta name="twitter:image" content="https://x.com/t.png">', 'https://x.com/t.png'],
    [ld({ '@type': 'Product', image: ['https://x.com/1.jpg', 'https://x.com/2.jpg'] }), 'https://x.com/1.jpg'],
    [ld({ '@type': 'Product', image: { '@type': 'ImageObject', url: 'https://x.com/o.jpg' } }), 'https://x.com/o.jpg'],
    // Off Amazon, a stray product-CDN image is not taken as the photo.
    ['<img src="https://m.media-amazon.com/images/I/71abc+XY.jpg">', null],
    ['<meta property="og:image" content="javascript:alert(1)">', null],
    ['<html>nothing</html>', null],
  ])('%s', (html, expected) => {
    expect(extractImage(html, 'https://shop.com/p/1')).toBe(expected);
  });
});

describe('prices: extractImage on Amazon pages', () => {
  // Shape of a real mobile product page: ads, related items and banners come first; the main photo is marked.
  const page = (main: string) => `<img src="https://m.media-amazon.com/images/I/315PBUzfZiL.jpg">
    <img src="https://m.media-amazon.com/images/I/71ALZ1A7tPL._AC_QL10_SX980_SY55_FMwebp_.jpg">${main}
    <img src="https://m.media-amazon.com/images/I/61QHSgaTAPL.jpg">`;
  const at = 'https://www.amazon.com/gp/aw/d/B09B8V1LZ3';
  it.each<[string, string, string | null]>([
    ['data-old-hires', '<img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/61J2sQtBYDL._AC_SL1500_.jpg" src="https://m.media-amazon.com/images/I/61J2sQtBYDL._AC_SY355_.jpg">', 'https://m.media-amazon.com/images/I/61J2sQtBYDL._AC_SL1500_.jpg'],
    ['hiRes in the image data', '<script>var d = {"colorImages":{"initial":[{"hiRes":"https://m.media-amazon.com/images/I/81et5+XmUyL._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/41x.jpg"}]}};</script>', 'https://m.media-amazon.com/images/I/81et5+XmUyL._AC_SL1500_.jpg'],
    ['landingImage src', '<img alt="" id="landingImage" src="https://m.media-amazon.com/images/I/51Nmy+ZjVrL._AC_SY355_.jpg">', 'https://m.media-amazon.com/images/I/51Nmy+ZjVrL._AC_SY355_.jpg'],
    ['no main-photo marker: no guess', '', null],
  ])('%s', (_, main, expected) => {
    expect(extractImage(page(main), at)).toBe(expected);
  });
});

describe('prices: SSRF guard', () => {
  it.each(['127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '240.0.0.1', '198.18.0.1', '192.0.2.1',
    '::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:8.8.8.8', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:db8::1', '2001::1'])('rejects %s', (addr) => {
    expect(isPublicIp(addr)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e'])('accepts %s', (addr) => {
    expect(isPublicIp(addr)).toBe(true);
  });

  it('rejects anything that is not an IP', () => {
    expect(isPublicIp('localhost')).toBe(false);
    expect(isPublicIp('')).toBe(false);
  });

  const lookup = (table: Record<string, string[]>) => async (host: string) => {
    if (net.isIP(host)) return [{ address: host, family: net.isIP(host) }];
    if (!table[host]) throw new Error('ENOTFOUND');
    return table[host]!.map((address) => ({ address, family: net.isIP(address) }));
  };
  const hosts = { 'shop.example': ['93.184.216.34'], 'mixed.example': ['93.184.216.34', '10.0.0.5'], 'internal.example': ['192.168.1.20'] };

  it('checks scheme, host and every resolved address', async () => {
    const check = (u: string) => checkUrl(u, lookup(hosts));
    await expect(check('https://shop.example/x')).resolves.toBeUndefined();
    await expect(check('file:///etc/passwd')).rejects.toThrow('Only http(s)');
    await expect(check('ftp://shop.example')).rejects.toThrow('Only http(s)');
    await expect(check('not a url')).rejects.toThrow('Only http(s)');
    await expect(check('http://gone.example/')).rejects.toThrow("Couldn't reach");
    for (const u of ['http://127.0.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://169.254.169.254/latest', 'http://2130706433/', 'http://0x7f.1/', 'http://internal.example/', 'http://mixed.example/']) {
      await expect(check(u), u).rejects.toThrow("doesn't point to a public website");
    }
    await expect(check('http://[2606:4700:4700::1111]/')).resolves.toBeUndefined();
  });

  it('really refuses loopback names with the default resolver (no network needed)', async () => {
    const get = createHttpFetcher();
    for (const u of ['file:///etc/passwd', 'ftp://x', 'http://127.0.0.1/', 'http://localhost/']) await expect(fetchPrice(u, get), u).rejects.toBeInstanceOf(PriceError);
  });

  const res = (status: number, init: { location?: string; body?: BodyInit } = {}) =>
    new Response(init.body ?? null, { status, headers: init.location ? { location: init.location } : {} });

  it('re-checks every redirect hop, and never requests a private target', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => (String(url).startsWith('https://shop.example') ? res(302, { location: 'http://169.254.169.254/latest/meta-data' }) : res(200, { body: 'secret' })));
    const get = createHttpFetcher({ lookup: lookup(hosts), fetchImpl: fetchImpl as typeof fetch });
    await expect(get('https://shop.example/p')).rejects.toThrow("doesn't point to a public website");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const viaName = createHttpFetcher({ lookup: lookup(hosts), fetchImpl: (async () => res(301, { location: 'http://internal.example/admin' })) as typeof fetch });
    await expect(viaName('https://shop.example/p')).rejects.toThrow("doesn't point to a public website");
    const nonHttp = createHttpFetcher({ lookup: lookup(hosts), fetchImpl: (async () => res(302, { location: 'file:///etc/passwd' })) as typeof fetch });
    await expect(nonHttp('https://shop.example/p')).rejects.toThrow('Only http(s)');
  });

  it('follows relative redirects to a public page, up to 5', async () => {
    let n = 0;
    const chain = (max: number) => createHttpFetcher({ lookup: lookup(hosts), fetchImpl: (async () => (n++ < max ? res(302, { location: '/next' + n }) : res(200, { body: '<p>ok</p>' }))) as typeof fetch });
    n = 0;
    await expect(chain(5)('https://shop.example/a')).resolves.toEqual({ html: '<p>ok</p>', finalUrl: 'https://shop.example/next5' });
    n = 0;
    await expect(chain(6)('https://shop.example/a')).rejects.toThrow("Couldn't load that page");
  });

  it('reports store errors, network failures, and caps the page at 3 MB', async () => {
    const get = (impl: () => Promise<Response>) => createHttpFetcher({ lookup: lookup(hosts), fetchImpl: impl as typeof fetch })('https://shop.example/p');
    await expect(get(async () => res(404))).rejects.toThrow('The store returned an error (HTTP 404)');
    await expect(get(async () => res(302))).rejects.toThrow('(HTTP 302)');
    await expect(get(async () => { throw new TypeError('fetch failed'); })).rejects.toThrow("Couldn't load that page");
    const big = await get(async () => res(200, { body: 'x'.repeat(4 * 1024 * 1024) }));
    expect(big.html).toHaveLength(3 * 1024 * 1024);
  });
});

const tracked = (tracker: Record<string, unknown> = {}) => ({ link: 'https://shop.example/x', priceTracker: { pct: 10, basePrice: null, notifiedAt: null, ...tracker } });

describe('prices: checkGift', () => {
  it('sets the base price and notifies once at the threshold', async () => {
    const gift = tracked();
    expect(await checkGift(gift, async () => 100, 1)).toBe(false);
    const t = gift.priceTracker as any;
    expect([t.basePrice, t.lastPrice, t.checkedAt, t.error]).toEqual([100, 100, 1, null]);
    expect(await checkGift(gift, async () => 90.01, 2)).toBe(false);
    expect(await checkGift(gift, async () => 90, 3)).toBe(true);
    expect(t.notifiedAt).toBe(3);
    expect(await checkGift(gift, async () => 50, 4)).toBe(false);
  });

  it('records a PriceError and keeps the last price; other errors propagate', async () => {
    const gift = tracked({ basePrice: 100, lastPrice: 95 });
    expect(await checkGift(gift, async () => { throw new PriceError('nope'); }, 5)).toBe(false);
    const t = gift.priceTracker as any;
    expect([t.error, t.checkedAt, t.lastPrice]).toEqual(['nope', 5, 95]);
    await expect(checkGift(gift, async () => { throw new Error('bug'); }, 6)).rejects.toThrow('bug');
  });
});

describe('prices: mergeTracker', () => {
  it('only takes pct from the client; email falls back to the editor', () => {
    const merged = mergeTracker({ link: 'https://a', priceTracker: { pct: 10, email: 'evil@x.com', basePrice: 1, notifiedAt: 5 } }, null, 'mom@example.com');
    expect(merged.priceTracker).toEqual({ pct: 10, email: 'mom@example.com', basePrice: null, lastPrice: null, checkedAt: null, notifiedAt: null, error: null });
  });
  it('drops an empty tracker or one without a link', () => {
    expect(mergeTracker({ link: 'https://a', priceTracker: {} }, null, 'm')).not.toHaveProperty('priceTracker');
    expect(mergeTracker({ link: '', priceTracker: { pct: 10 } }, null, 'm')).not.toHaveProperty('priceTracker');
  });
  it.each([0, 100, 'abc', true, null, 0.5, 99.5])('rejects pct %j', (pct) => {
    expect(() => mergeTracker({ link: 'https://a', priceTracker: { pct } }, null, 'm')).toThrow(RangeError);
  });
});

const GIFT = { recipient: 'Mom', idea: 'Cardigan', link: 'https://shop.example/a' };
const A = 'https://shop.example/a';

async function year() {
  const app = makeApp();
  await app.planner('mom', 'PUT', '/years/2026/settings', { currency: 'USD' });
  const stored = async (c = 'gifts', id = 'g1') => ((await app.db.get('planner', 'HH#main#Y#2026', `I#${c}#${id}`))?.doc ?? null) as any;
  const put = (body: unknown, who: 'mom' | 'dad' = 'mom', id = 'g1', c = 'gifts') => app.planner(who, 'PUT', `/years/2026/items/${c}/${id}`, body);
  return { app, stored, put };
}

describe('prices: gift routes', () => {
  it('keeps the tracker server-owned', async () => {
    const { app, stored, put } = await year();
    const forged = { pct: 10, email: 'evil@x.com', basePrice: 1, notifiedAt: 5 };
    const res = await put({ ...GIFT, priceTracker: forged }, 'dad');
    expect(res.status).toBe(200);
    expect((res.body as any).item.priceTracker).toEqual({ pct: 10, email: 'dad@example.com', basePrice: null, lastPrice: null, checkedAt: null, notifiedAt: null, error: null });
    const server = { ...(await stored()).priceTracker, basePrice: 100, lastPrice: 80, checkedAt: 7, notifiedAt: 8 };
    await app.db.put('planner', { pk: 'HH#main#Y#2026', sk: 'I#gifts#g1', doc: { ...(await stored()), priceTracker: server }, updatedBy: 't', updatedAt: 1 });
    // A stale client copy can't clobber server fields or the owner's email.
    await put({ ...GIFT, priceTracker: { ...forged, basePrice: 999, lastPrice: 1, notifiedAt: null } });
    expect((await stored()).priceTracker).toEqual(server);
    // Changing the percentage re-arms the alert; the rest is kept.
    await put({ ...GIFT, priceTracker: { pct: 25 } });
    expect((await stored()).priceTracker).toEqual({ ...server, pct: 25, notifiedAt: null });
    // Changing the link starts fresh.
    await put({ ...GIFT, link: 'https://shop.example/b', priceTracker: { pct: 25 } });
    const t = (await stored()).priceTracker;
    expect([t.basePrice, t.lastPrice, t.checkedAt]).toEqual([null, null, null]);
  });

  it.each([0, 100, 'abc', true, null])('rejects a bad pct (%j)', async (pct) => {
    const { put } = await year();
    const res = await put({ ...GIFT, priceTracker: { pct } });
    expect(res).toEqual({ status: 400, body: { error: 'Tracker percentage must be between 1 and 99' } });
  });

  it('drops the tracker when the link is removed', async () => {
    const { put, stored } = await year();
    await put({ ...GIFT, priceTracker: { pct: 10 } });
    const res = await put({ ...GIFT, link: '', priceTracker: { pct: 10 } });
    expect(res.status).toBe(200);
    expect((res.body as any).item).not.toHaveProperty('priceTracker');
    expect(await stored()).not.toHaveProperty('priceTracker');
  });

  it('check-price: 404 unknown gift, 400 not tracking, then stores the price', async () => {
    const { app, put, stored } = await year();
    const path = '/years/2026/gifts/g1/check-price';
    expect((await app.planner('mom', 'POST', path)).body).toEqual({ error: 'Gift not found' });
    await put({ recipient: 'Mom', idea: 'Cardigan' });
    expect((await app.planner('mom', 'POST', path)).body).toEqual({ error: "This gift isn't tracking a price" });
    await put({ ...GIFT, priceTracker: { pct: 10 } });
    app.pages.set(A, page(40));
    const res = await app.planner('mom', 'POST', path);
    expect(res.status).toBe(200);
    expect((res.body as any).item.priceTracker.basePrice).toBe(40);
    expect((await stored()).priceTracker.lastPrice).toBe(40);
    expect((await app.planner(null, 'POST', path)).status).toBe(401);
    expect((await app.planner('mom', 'POST', '/years/2026/todos/g1/check-price')).status).toBe(404);
  });

  it('check-price records a page failure on the gift instead of failing', async () => {
    const { app, put, stored } = await year();
    await put({ ...GIFT, priceTracker: { pct: 10 } });
    const res = await app.planner('mom', 'POST', '/years/2026/gifts/g1/check-price');
    expect(res.status).toBe(200);
    expect((await stored()).priceTracker.error).toBe("Couldn't load that page");
  });

  it('tracks birthday gifts like Christmas gifts', async () => {
    const { app, put, stored } = await year();
    app.pages.set(A, page(50));
    await put({ ...GIFT, priceTracker: { pct: 10, basePrice: 1 } }, 'mom', 'b1', 'bday_gifts');
    expect((await stored('bday_gifts', 'b1')).priceTracker.basePrice).toBeNull(); // server-owned
    expect(await app.checkPrices()).toEqual({ checked: 1 });
    expect((await stored('bday_gifts', 'b1')).priceTracker.basePrice).toBe(50);
    const res = await app.planner('mom', 'POST', '/years/2026/bday_gifts/b1/check-price');
    expect(res.status).toBe(200);
    expect(await stored('gifts', 'b1')).toBeNull();
  });

  it('link-image: 401, 400, 422, and the photo', async () => {
    const { app } = await year();
    expect((await app.planner(null, 'POST', '/link-image', { url: A })).status).toBe(401);
    expect((await app.planner('mom', 'POST', '/link-image', { url: 5 })).body).toEqual({ error: 'Missing link' });
    expect((await app.planner('mom', 'POST', '/link-image', { url: 'https://x.com/' + 'a'.repeat(2000) })).status).toBe(400);
    expect((await app.planner('mom', 'POST', '/link-image', { url: 'https://shop.com/p' })).status).toBe(422);
    app.pages.set('https://shop.com/p', '<meta property="og:image" content="https://x.com/i.jpg">');
    expect(await app.planner('mom', 'POST', '/link-image', { url: 'https://shop.com/p' })).toEqual({ status: 200, body: { image: 'https://x.com/i.jpg' } });
    app.pages.set('https://shop.com/none', '<html></html>');
    expect(((await app.planner('mom', 'POST', '/link-image', { url: 'https://shop.com/none' })).body as any).image).toBeNull();
  });
});

describe('prices: scheduled check and alerts', () => {
  async function setup() {
    const ctx = await year();
    for (const [id, extra] of [['g1', {}], ['g2', { purchased: true }], ['g3', { link: '' }]] as const) await ctx.put({ ...GIFT, ...extra, priceTracker: { pct: 10 } }, 'mom', id);
    return ctx;
  }

  it('checks only unpurchased, linked, tracked gifts, and emails a drop exactly once', async () => {
    const { app, stored } = await setup();
    app.pages.set(A, page(100));
    expect(await app.checkPrices()).toEqual({ checked: 1 });
    expect((await stored()).priceTracker.basePrice).toBe(100);
    expect((await stored('gifts', 'g2')).priceTracker.basePrice).toBeNull();
    expect(app.emails).toEqual([]);
    app.pages.set(A, page(85));
    await app.checkPrices();
    await app.checkPrices();
    expect(app.emails).toHaveLength(1);
    expect(app.emails[0]).toMatchObject({ to: 'mom@example.com', subject: 'Price drop: Cardigan is now USD 85.00' });
    expect(app.emails[0]!.body).toContain('Drop: 15.0%');
    expect(app.emails[0]!.body).toContain('Original price: USD 100.00');
    expect(app.emails[0]!.body).toContain('Link: ' + A);
  });

  it('re-arms only when the percentage changes', async () => {
    const { app, put } = await setup();
    app.pages.set(A, page(100));
    await app.checkPrices();
    app.pages.set(A, page(85));
    await app.checkPrices();
    expect(app.emails).toHaveLength(1);
    await put({ ...GIFT, priceTracker: { pct: 10 } }); // same pct: still notified
    await app.checkPrices();
    expect(app.emails).toHaveLength(1);
    await put({ ...GIFT, priceTracker: { pct: 12 } }); // new pct: re-armed
    await app.checkPrices();
    expect(app.emails).toHaveLength(2);
  });

  it('a failed send leaves the alert armed for the next run', async () => {
    const { app, stored } = await setup();
    app.pages.set(A, page(100));
    await app.checkPrices();
    app.pages.set(A, page(80));
    const spy = vi.spyOn(app.emails, 'push').mockImplementationOnce(() => {
      throw new Error('SES down');
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    await app.checkPrices();
    quiet.mockRestore();
    spy.mockRestore();
    expect((await stored()).priceTracker.notifiedAt).toBeNull();
    expect(app.emails).toHaveLength(0);
    await app.checkPrices();
    expect(app.emails).toHaveLength(1);
    expect((await stored()).priceTracker.notifiedAt).toBeTruthy();
  });

  it('one failing gift does not stop the others', async () => {
    const { app, put, stored } = await setup();
    await put({ ...GIFT, link: 'https://broken.example/x', priceTracker: { pct: 10 } }, 'mom', 'g4');
    app.pages.set(A, page(60));
    expect(await app.checkPrices()).toEqual({ checked: 2 });
    expect((await stored()).priceTracker.basePrice).toBe(60);
    expect((await stored('gifts', 'g4')).priceTracker.error).toBe("Couldn't load that page");
  });

  it('never emails an address that is not on the allowlist, and logs locally by default', async () => {
    const gift = { ...GIFT, id: 'g1', priceTracker: { pct: 10, email: 'intruder@x.com', basePrice: 100, lastPrice: 80 } };
    const sent: { to: string; subject: string; body: string }[] = [];
    const deps = { allowlist: async () => FAMILY, sendEmail: async (m: (typeof sent)[number]) => void sent.push(m) };
    await sendAlert(gift, 'USD', deps);
    expect(sent).toEqual([]);
    gift.priceTracker.email = 'MOM@example.com';
    await sendAlert(gift, 'USD', deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('mom@example.com');

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendAlert(gift, 'USD', { ...deps, sendEmail: logEmail });
    const out = String(log.mock.calls[0]![0]);
    log.mockRestore();
    expect(out).toContain('[price alert] To: mom@example.com');
    expect(out).toContain('Price drop: Cardigan is now USD 80.00');
    expect(out).toContain('Drop: 20.0%');
    expect(out).toContain(GIFT.link);
  });

  it('keeps the subject on one line even if the idea has newlines', async () => {
    const sent: { subject: string }[] = [];
    await sendAlert({ ...GIFT, idea: 'Evil\r\nBcc: x@y.z', priceTracker: { email: 'mom@example.com', basePrice: 10, lastPrice: 5 } }, 'USD', { allowlist: async () => FAMILY, sendEmail: async (m) => void sent.push(m) });
    expect(sent[0]!.subject).not.toMatch(/[\r\n]/);
  });
});

describe('prices: Amazon', () => {
  const AMAZON_PAGE = '<div id="corePrice_feature_div"><span class="a-price apex-pricetopay-value" data-a-size="xl"> <span class="a-offscreen">$1,079.99</span></span></div>';

  it.each<[string, [string, string] | null]>([
    ['https://www.amazon.com/dp/B09B8V1LZ3', ['amazon.com', 'B09B8V1LZ3']],
    ['https://www.amazon.com/Some-Name/dp/B0BDHWDR12/ref=sr_1_1?k=x', ['amazon.com', 'B0BDHWDR12']],
    ['https://smile.amazon.co.uk/gp/product/B0BDHWDR12', ['amazon.co.uk', 'B0BDHWDR12']],
    ['https://www.amazon.com/gp/aw/d/B0BDHWDR12', ['amazon.com', 'B0BDHWDR12']],
    ['https://www.amazon.com/s?k=airpods', null],
    ['https://evil.example/dp/B0BDHWDR12', null],
    ['https://notamazon.com/dp/B0BDHWDR12', null],
  ])('parses %s', (url, expected) => {
    expect(amazon(url)).toEqual(expected);
  });

  it('reads the price markup', () => {
    expect(amazonPrice(AMAZON_PAGE)).toBe(1079.99);
    expect(amazonPrice('<input id="twister-plus-price-data-price" value="19.5" />')).toBe(19.5);
    expect(amazonPrice("<span class='a-offscreen'>$5.00</span> recommended item")).toBeNull();
  });

  it('uses the mobile page and follows short links', async () => {
    const fetched: string[] = [];
    const get: FetchPage = async (url) => {
      fetched.push(url);
      return { html: AMAZON_PAGE, finalUrl: 'https://www.amazon.com/Name/dp/B0BDHWDR12?tag=x' };
    };
    expect(await fetchPrice('https://www.amazon.com/dp/B09B8V1LZ3', get)).toBe(1079.99);
    expect(fetched).toEqual(['https://amazon.com/gp/aw/d/B09B8V1LZ3']);
    fetched.length = 0;
    expect(await fetchPrice('https://amzn.to/abc123', get)).toBe(1079.99);
    expect(fetched).toEqual(['https://amzn.to/abc123', 'https://amazon.com/gp/aw/d/B0BDHWDR12']);
  });

  it('resolves an a.co link through the guarded fetcher even when the product page answers 503', async () => {
    const hosts = { 'a.co': ['93.184.216.34'], 'www.amazon.com': ['93.184.216.35'] };
    const seen: string[] = [];
    const fetchImpl = async (url: string) => {
      seen.push(url);
      return url.startsWith('https://a.co/')
        ? new Response(null, { status: 301, headers: { location: 'https://www.amazon.com/Name/dp/B0BDHWDR12?ref=x' } })
        : new Response('robot check', { status: 503 });
    };
    const lookup = async (h: string) => (hosts[h as keyof typeof hosts] ?? ['10.0.0.1']).map((address) => ({ address, family: 4 }));
    const get = createHttpFetcher({ lookup, fetchImpl: fetchImpl as unknown as typeof fetch });
    const fetched: string[] = [];
    const guarded: FetchPage = (u) => (u.includes('/gp/aw/d/') ? Promise.resolve({ html: '<img data-old-hires="https://m.media-amazon.com/images/I/71abc.jpg">', finalUrl: u }) : (fetched.push(u), get(u)));
    await expect(fetchImage('https://a.co/d/XXXXXXX', guarded)).resolves.toBe('https://m.media-amazon.com/images/I/71abc.jpg');
    expect(fetched).toEqual(['https://a.co/d/XXXXXXX']);
    expect(seen).toEqual(['https://a.co/d/XXXXXXX', 'https://www.amazon.com/Name/dp/B0BDHWDR12?ref=x']);
  });

  it('tries an Amazon link a second time when the store sends no product page, and then reports it as retryable', async () => {
    const good = '<img data-old-hires="https://m.media-amazon.com/images/I/81j7LCubVcL._AC_SL1500_.jpg">';
    const pause = async () => {};
    const flaky = (pages: (string | Error)[]): FetchPage => async (u) => {
      const next = pages.shift()!;
      if (next instanceof Error) throw next;
      return { html: u.startsWith('https://a.co/') ? '' : next, finalUrl: u.startsWith('https://a.co/') ? 'https://www.amazon.com/dp/B0BYQHW5PJ' : u };
    };
    // a.co hop + bot page, then a.co hop + real page
    await expect(fetchImage('https://a.co/d/0e15bo4N', flaky(['', '<html>robot check</html>', '', good]), pause)).resolves.toBe('https://m.media-amazon.com/images/I/81j7LCubVcL._AC_SL1500_.jpg');
    // an HTTP error from Amazon, then the real page
    await expect(fetchImage('https://www.amazon.com/dp/B0BYQHW5PJ', flaky([new PriceError('The store returned an error (HTTP 503)'), good]), pause)).resolves.toContain('81j7LCubVcL');
    // two misses: retryable, so the app asks again later instead of remembering "no photo"
    const err = await fetchImage('https://a.co/d/0e15bo4N', flaky(['', '<html>robot check</html>', '', '<html>robot check</html>']), pause).catch((e) => e);
    expect(err).toBeInstanceOf(PriceError);
    expect(err.retryable).toBe(true);
    // a non-Amazon page with no photo is a plain "no photo" (not retried)
    let calls = 0;
    await expect(fetchImage('https://shop.example/p/1', async (u) => (calls++, { html: '<p>none</p>', finalUrl: u }), pause)).resolves.toBeNull();
    expect(calls).toBe(1);
  });

  it.each([
    ['<html>Enter the characters you see - CAPTCHA</html>', 'blocked'],
    ['<html>Currently unavailable.</html>', 'unavailable'],
    ['<html>nothing</html>', 'find a price'],
  ])('explains a failure: %s', async (html, message) => {
    await expect(fetchPrice('https://www.amazon.com/dp/B09B8V1LZ3', async (url) => ({ html, finalUrl: url }))).rejects.toThrow(new RegExp(message));
  });
});

describe('prices: hostile pages', () => {
  it('parses 3 MB of pathological HTML in under 500 ms', () => {
    const MB3 = 3 * 1024 * 1024;
    const start = performance.now();
    for (const [unit, rest] of [['<a "', ''], ['<script>', ''], ['<style>', ''], ['<script a="', '']] as const) {
      expect(extractPrice(unit.repeat(Math.ceil(MB3 / unit.length)) + rest)).toBeNull();
    }
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('still reads a price near the start of an oversize page', () => {
    expect(extractPrice(page(12) + 'x'.repeat(2 * 1024 * 1024))).toBe(12);
  });
});

describe('prices: checkAndSave', () => {
  const NOW = new Date('2026-09-28T12:00:00Z');
  const setup = async (extra: Record<string, unknown> = {}) => {
    const store = plannerStore(new MemoryDb(), 'planner', () => NOW);
    const gift = { id: 'g1', ...GIFT, priceTracker: { pct: 10, email: 'mom@example.com', basePrice: 100, lastPrice: 100, checkedAt: null, notifiedAt: null, error: null }, ...extra };
    await store.putItem(2026, 'gifts', 'g1', gift, 'mom');
    return { store, gift: structuredClone(gift) };
  };
  const ctx = (store: Awaited<ReturnType<typeof setup>>['store'], over: Partial<Parameters<typeof checkAndSave>[0]> = {}) => ({
    store,
    allowlist: async () => ['mom@example.com'],
    fetchPage: async (url: string) => ({ html: page(80), finalUrl: url }),
    sendEmail: async () => {},
    now: () => NOW,
    ...over,
  });

  it('keeps the alert armed when the email cannot be sent', async () => {
    const { store, gift } = await setup();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sendEmail = vi.fn(async () => {
      throw new Error('PRICE_ALERT_FROM not set');
    });
    await checkAndSave(ctx(store, { sendEmail }), 2026, gift);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(((await store.getItem(2026, 'gifts', 'g1')) as any).priceTracker).toMatchObject({ lastPrice: 80, notifiedAt: null });
    const ok = vi.fn(async () => {});
    await checkAndSave(ctx(store, { sendEmail: ok }), 2026, ((await store.getItem(2026, 'gifts', 'g1')) as any));
    expect(ok).toHaveBeenCalledOnce(); // re-checkable, and now marked sent
    expect(((await store.getItem(2026, 'gifts', 'g1')) as any).priceTracker.notifiedAt).not.toBeNull();
    err.mockRestore();
  });

  it('does not revert edits made while the page was loading, nor recreate a deleted gift', async () => {
    const { store, gift } = await setup();
    const slow = async (url: string) => {
      await store.putItem(2026, 'gifts', 'g1', { ...gift, purchased: true }, 'dad'); // concurrent edit
      return { html: page(95), finalUrl: url };
    };
    await checkAndSave(ctx(store, { fetchPage: slow }), 2026, gift);
    const after = (await store.getItem(2026, 'gifts', 'g1')) as any;
    expect(after.purchased).toBe(true);
    expect(after.priceTracker.lastPrice).toBe(95);

    const gone = async (url: string) => {
      await store.deleteItem(2026, 'gifts', 'g1');
      return { html: page(90), finalUrl: url };
    };
    await checkAndSave(ctx(store, { fetchPage: gone }), 2026, structuredClone(gift));
    expect(await store.getItem(2026, 'gifts', 'g1')).toBeNull();
  });
});
