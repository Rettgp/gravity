import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export type Item = { pk: string; sk: string } & Record<string, unknown>;

export interface Db {
  get(table: string, pk: string, sk: string): Promise<Item | undefined>;
  put(table: string, item: Item): Promise<void>;
  delete(table: string, pk: string, sk: string): Promise<void>;
  query(table: string, pk: string, skPrefix?: string): Promise<Item[]>;
}

const SEP = '\u0000';

/** In-memory Db used by tests and local mode. Optionally persists to a JSON file. */
export class MemoryDb implements Db {
  private data = new Map<string, Item>();
  constructor(private file?: string) {
    if (file && existsSync(file)) {
      for (const [k, v] of Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, Item>)) this.data.set(k, v);
    }
  }
  private key = (t: string, pk: string, sk: string) => [t, pk, sk].join(SEP);
  private flush() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.data)));
  }
  async get(t: string, pk: string, sk: string) {
    const v = this.data.get(this.key(t, pk, sk));
    return v ? structuredClone(v) : undefined;
  }
  async put(t: string, item: Item) {
    this.data.set(this.key(t, item.pk, item.sk), structuredClone(item));
    this.flush();
  }
  async delete(t: string, pk: string, sk: string) {
    this.data.delete(this.key(t, pk, sk));
    this.flush();
  }
  async query(t: string, pk: string, prefix = '') {
    const start = [t, pk, prefix].join(SEP);
    return [...this.data.entries()]
      .filter(([k]) => k.startsWith(start))
      .map(([, v]) => structuredClone(v))
      .sort((a, b) => a.sk.localeCompare(b.sk));
  }
}
