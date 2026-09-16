type CacheEntry = { value: unknown; expiresAt: number };

class InMemoryCache {
  private store = new Map<string, CacheEntry>();
  private maxEntries = 500;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  entries(): IterableIterator<[string, CacheEntry]> {
    return this.store.entries();
  }
}

export const memoryCache = new InMemoryCache();
