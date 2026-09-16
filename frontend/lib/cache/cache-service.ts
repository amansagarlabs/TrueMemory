import Redis from "ioredis";
import { memoryCache } from "@/lib/cache/memory-fallback";

const USE_REDIS = Boolean(process.env.REDIS_URL);

if (!USE_REDIS) {
  console.warn("[cache] REDIS_URL not set - using in-memory cache (dev only, not distributed across instances)");
}

const redis = USE_REDIS
  ? new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    })
  : null;

redis?.on("error", (err) => {
  console.error("[cache] Redis connection error:", err.message);
});

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!redis) return memoryCache.get<T>(key);
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      console.warn(`[cache] get failed for ${key}, treating as miss`, err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      if (!redis) {
        memoryCache.set(key, value, ttlSeconds);
        return;
      }
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      console.warn(`[cache] set failed for ${key}`, err);
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      if (!redis) {
        memoryCache.delete(key);
        return;
      }
      await redis.del(key);
    } catch (err) {
      console.warn(`[cache] invalidate failed for ${key}`, err);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (!redis) {
        const regex = new RegExp("^" + pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
        for (const key of memoryCache.keys()) {
          if (regex.test(key)) memoryCache.delete(key);
        }
        return;
      }
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    } catch (err) {
      console.warn(`[cache] invalidate failed for ${pattern}`, err);
    }
  }

  async getStats(): Promise<{ totalKeys: number; byPrefix: Record<string, number> }> {
    try {
      if (!redis) {
        const keys = memoryCache.keys().filter((key) => key.startsWith("cache:"));
        const byPrefix: Record<string, number> = {};
        for (const key of keys) {
          const prefix = key.split(":")[1] || "unknown";
          byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
        }
        return { totalKeys: keys.length, byPrefix };
      }
      const keys = await redis.keys("cache:*");
      const byPrefix: Record<string, number> = {};
      for (const key of keys) {
        const prefix = key.split(":")[1] || "unknown";
        byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
      }
      return { totalKeys: keys.length, byPrefix };
    } catch {
      return { totalKeys: 0, byPrefix: {} };
    }
  }

  async withCache<T>(key: string, ttlSeconds: number, fetchFn: () => Promise<T>): Promise<{ data: T; cached: boolean }> {
    const cached = await this.get<T>(key);
    if (cached !== null) return { data: cached, cached: true };
    const fresh = await fetchFn();
    await this.set(key, fresh, ttlSeconds);
    return { data: fresh, cached: false };
  }
}

export const cacheService = new CacheService();
