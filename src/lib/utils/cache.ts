interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  staleData?: T;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /** Return value if not expired, else null */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) return null;
    return entry.data;
  }

  /** Return value even if expired (for stale-serve on errors) */
  getStale<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
