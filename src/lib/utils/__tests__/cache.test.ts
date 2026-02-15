import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set', () => {
    it('returns null for unknown key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('stores and retrieves a value', () => {
      cache.set('key1', { hello: 'world' }, 60_000);
      expect(cache.get<{ hello: string }>('key1')).toEqual({ hello: 'world' });
    });

    it('stores strings', () => {
      cache.set('str', 'test-value', 5_000);
      expect(cache.get<string>('str')).toBe('test-value');
    });

    it('stores numbers', () => {
      cache.set('num', 42, 5_000);
      expect(cache.get<number>('num')).toBe(42);
    });

    it('stores arrays', () => {
      cache.set('arr', [1, 2, 3], 5_000);
      expect(cache.get<number[]>('arr')).toEqual([1, 2, 3]);
    });

    it('overwrites existing key', () => {
      cache.set('key', 'old', 60_000);
      cache.set('key', 'new', 60_000);
      expect(cache.get<string>('key')).toBe('new');
    });
  });

  describe('TTL expiration', () => {
    it('returns value before TTL expires', () => {
      cache.set('key', 'value', 10_000);
      vi.advanceTimersByTime(9_999);
      expect(cache.get<string>('key')).toBe('value');
    });

    it('returns null after TTL expires', () => {
      cache.set('key', 'value', 10_000);
      vi.advanceTimersByTime(10_001);
      expect(cache.get<string>('key')).toBeNull();
    });

    it('returns null exactly at TTL boundary', () => {
      cache.set('key', 'value', 10_000);
      vi.advanceTimersByTime(10_001); // just past expiry
      expect(cache.get<string>('key')).toBeNull();
    });

    it('handles very short TTL', () => {
      cache.set('key', 'value', 1);
      vi.advanceTimersByTime(2);
      expect(cache.get<string>('key')).toBeNull();
    });
  });

  describe('getStale', () => {
    it('returns null for unknown key', () => {
      expect(cache.getStale('nonexistent')).toBeNull();
    });

    it('returns value before TTL expires', () => {
      cache.set('key', 'value', 10_000);
      expect(cache.getStale<string>('key')).toBe('value');
    });

    it('returns value AFTER TTL expires (stale-serve)', () => {
      cache.set('key', 'stale-value', 10_000);
      vi.advanceTimersByTime(999_999);
      expect(cache.getStale<string>('key')).toBe('stale-value');
    });
  });

  describe('delete', () => {
    it('removes a key', () => {
      cache.set('key', 'value', 60_000);
      cache.delete('key');
      expect(cache.get<string>('key')).toBeNull();
    });

    it('does nothing for non-existent key', () => {
      // Should not throw
      cache.delete('nonexistent');
    });

    it('only removes specified key', () => {
      cache.set('a', 1, 60_000);
      cache.set('b', 2, 60_000);
      cache.delete('a');
      expect(cache.get<number>('a')).toBeNull();
      expect(cache.get<number>('b')).toBe(2);
    });
  });

  describe('clear', () => {
    it('removes all keys', () => {
      cache.set('a', 1, 60_000);
      cache.set('b', 2, 60_000);
      cache.set('c', 3, 60_000);
      cache.clear();
      expect(cache.get<number>('a')).toBeNull();
      expect(cache.get<number>('b')).toBeNull();
      expect(cache.get<number>('c')).toBeNull();
    });

    it('works on empty cache', () => {
      cache.clear();
      // Should not throw
    });
  });
});
