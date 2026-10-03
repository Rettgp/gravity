import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Where glimmer photos live. Keys look like glimmers/<id>/full.img. Only the API ever reads them, behind the JWT. */
export interface PhotoStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | undefined>;
  delete(keys: string[]): Promise<void>;
}

export class MemoryPhotos implements PhotoStore {
  private data = new Map<string, { bytes: Buffer; contentType: string }>();
  async put(key: string, bytes: Buffer, contentType: string) {
    this.data.set(key, { bytes, contentType });
  }
  async get(key: string) {
    return this.data.get(key);
  }
  async delete(keys: string[]) {
    for (const k of keys) this.data.delete(k);
  }
  has = (key: string) => this.data.has(key);
}

/** Local-dev store: plain files under a folder, so photos survive API restarts like the JSON database does. */
export class FilePhotos implements PhotoStore {
  constructor(private dir: string) {}
  private path = (key: string) => join(this.dir, key.replace(/[^A-Za-z0-9._-]/g, '_'));
  async put(key: string, bytes: Buffer, contentType: string) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path(key), bytes);
    writeFileSync(this.path(key) + '.type', contentType);
  }
  async get(key: string) {
    const p = this.path(key);
    return existsSync(p) ? { bytes: readFileSync(p), contentType: readFileSync(p + '.type', 'utf8') } : undefined;
  }
  async delete(keys: string[]) {
    for (const k of keys) {
      rmSync(this.path(k), { force: true });
      rmSync(this.path(k) + '.type', { force: true });
    }
  }
}

const DATA_URL = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/]+=*)$/;
export function parseDataUrl(url: string): { contentType: string; bytes: Buffer } {
  const m = DATA_URL.exec(url);
  if (!m) throw new Error('Not an image data URL');
  return { contentType: m[1]!, bytes: Buffer.from(m[2]!, 'base64') };
}
export const toDataUrl = (contentType: string, bytes: Buffer) => `data:${contentType};base64,${bytes.toString('base64')}`;
