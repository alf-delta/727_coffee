import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Dev-only in-memory stand-in with the subset of the Upstash Redis client
 * surface this project uses. Auto-activates when no Redis env vars are
 * present, so `npm run dev` works end-to-end before any Vercel/Upstash
 * account setup happens. Never used when deployed with real credentials.
 */
class MemoryKV {
  constructor() {
    this.store = new Map();
  }

  _expired(entry) {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  _read(key) {
    const entry = this.store.get(key);
    if (!entry || this._expired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key) {
    const entry = this._read(key);
    return entry ? entry.value : null;
  }

  async set(key, value, opts = {}) {
    if (opts.nx && this._read(key)) return null;
    const ttlMs = opts.ex ? opts.ex * 1000 : opts.px ?? null;
    this.store.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : null });
    return 'OK';
  }

  async del(key) {
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key) {
    const entry = this._read(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    this.store.set(key, { value: next, expiresAt: entry ? entry.expiresAt : null });
    return next;
  }

  async decr(key) {
    const entry = this._read(key);
    const next = (entry ? Number(entry.value) : 0) - 1;
    this.store.set(key, { value: next, expiresAt: entry ? entry.expiresAt : null });
    return next;
  }

  async expire(key, seconds) {
    const entry = this._read(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async keys(pattern) {
    const prefix = pattern.replace(/\*$/, '');
    const out = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix) && this._read(key)) out.push(key);
    }
    return out;
  }
}

export const usingMemoryKv = !(url && token);
export const kv = usingMemoryKv ? new MemoryKV() : new Redis({ url, token });
