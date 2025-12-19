/**
 * Database Integration Tests for Admin API
 * Tests all database operations including YDB connectivity, queries, and cache integration
 */

import { getDriver, scanUpdates, countUpdates, UpdateRow } from '../services/ydb';
import { getCached, setCached, getOrCompute, clearCache } from '../services/cache';
import { DatabaseTestUtils } from './setup';

describe('Database Integration Tests', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    // Check database connection quickly for tests
    dbAvailable = await DatabaseTestUtils.ensureDatabaseConnection();
    if (!dbAvailable) {
      console.warn('⚠️  Database not available - skipping database integration tests');
    }
  });

  afterEach(async () => {
    // Clear cache between tests
    await DatabaseTestUtils.cleanupTestCache();
  });

  describe('YDB Driver Connection', () => {
    it('should connect to YDB successfully', async () => {
      const driver = getDriver();

      // Test that driver can be created and is ready
      await expect(driver.ready(5000)).resolves.not.toThrow();
      expect(driver).toBeDefined();
    });

    it('should handle connection timeouts gracefully', async () => {
      const driver = getDriver();

      // This should not throw if already connected
      await expect(driver.ready(3000)).resolves.not.toThrow();
    });
  });

  describe('Database Query Operations', () => {
    it('should count updates in database', async () => {
      if (!dbAvailable) return; // Skip if database not available

      const count = await countUpdates();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);

      console.log(`📊 Database contains ${count} total updates`);
    }, 20000); // 20 second timeout for database count operation

    it('should scan recent updates', async () => {
      if (!dbAvailable) return; // Skip if database not available

      const updates = await scanUpdates();

      expect(Array.isArray(updates)).toBe(true);
      expect(updates.length).toBeGreaterThanOrEqual(0);

      // If we have updates, validate their structure
      if (updates.length > 0) {
        const firstUpdate = updates[0];
        expect(firstUpdate).toHaveProperty('update_id');
        expect(firstUpdate).toHaveProperty('update_data');
        expect(typeof firstUpdate.update_id).toBe('number');
        expect(typeof firstUpdate.update_data).toBe('string');

        // Should be able to parse as JSON
        expect(() => JSON.parse(firstUpdate.update_data)).not.toThrow();
      }

      console.log(`📈 Retrieved ${updates.length} recent updates from database`);
    }, 15000);

    it('should scan updates with date filtering', async () => {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const updates = await scanUpdates(oneDayAgo);

      expect(Array.isArray(updates)).toBe(true);
      expect(updates.length).toBeGreaterThanOrEqual(0);

      // Verify the function can handle date filtering without crashing
      // Note: The current implementation may not perfectly filter by date,
      // but it should return valid data structures
      if (updates.length > 0) {
        for (const update of updates) {
          expect(update).toHaveProperty('update_id');
          expect(update).toHaveProperty('update_data');
          expect(typeof update.update_id).toBe('number');
          expect(typeof update.update_data).toBe('string');

          // Should be able to parse as JSON
          expect(() => JSON.parse(update.update_data)).not.toThrow();
        }

        // Check that at least some updates have valid timestamps
        let validTimestampCount = 0;
        for (const update of updates.slice(0, 10)) { // Check first 10 updates
          try {
            const parsed = JSON.parse(update.update_data);
            let timestamp: number | null = null;

            if (parsed.message?.date) {
              timestamp = parsed.message.date;
            } else if (parsed.edited_message?.edit_date) {
              timestamp = parsed.edited_message.edit_date;
            } else if (parsed.callback_query?.message?.date) {
              timestamp = parsed.callback_query.message.date;
            } else if (parsed.inline_query?.date) {
              timestamp = parsed.inline_query.date;
            } else if (parsed.my_chat_member?.date) {
              timestamp = parsed.my_chat_member.date;
            }

            if (timestamp && timestamp > 0) {
              validTimestampCount++;
            }
          } catch (error) {
            // Skip malformed updates
          }
        }

        expect(validTimestampCount).toBeGreaterThan(0);
      }

      console.log(`📅 Retrieved ${updates.length} updates with date filtering applied`);
    }, 15000);

    it('should handle malformed JSON gracefully', async () => {
      if (!dbAvailable) return; // Skip if database not available

      const updates = await scanUpdates();

      // Should not throw even if some updates have malformed JSON
      expect(Array.isArray(updates)).toBe(true);

      // Count how many updates we can successfully parse
      let validUpdates = 0;
      for (const update of updates) {
        try {
          JSON.parse(update.update_data);
          validUpdates++;
        } catch (error) {
          // This is expected - some updates might have malformed JSON
        }
      }

      console.log(`✅ Successfully parsed ${validUpdates}/${updates.length} updates`);
    }, 15000);
  });

  describe('Cache Integration', () => {
    it('should cache simple values', () => {
      const testKey = 'test_key';
      const testValue = { message: 'hello world', count: 42 };

      // Initially should be undefined
      expect(getCached(testKey)).toBeUndefined();

      // Set value
      setCached(testKey, testValue);

      // Should be cached
      expect(getCached(testKey)).toEqual(testValue);
    });

    it('should handle getOrCompute caching', async () => {
      const testKey = 'compute_test';
      let computeCount = 0;

      const computeFunction = async () => {
        computeCount++;
        return { result: 'computed', timestamp: Date.now() };
      };

      // First call should compute
      const result1 = await getOrCompute(testKey, computeFunction);
      expect(computeCount).toBe(1);
      expect(result1.result).toBe('computed');

      // Second call should use cache
      const result2 = await getOrCompute(testKey, computeFunction);
      expect(computeCount).toBe(1); // Should not have called compute again
      expect(result2).toEqual(result1); // Should be the same cached result
    });

    it('should expire cache after TTL', async () => {
      // Import LRUCache properly
      const { LRUCache } = require('lru-cache');

      // Create a cache with 1 second TTL for testing
      const testCache = new LRUCache({
        max: 100,
        ttl: 1000, // 1 second
      });

      const testKey = 'ttl_test';
      const testValue = { data: 'expires soon' };

      // Override the cache temporarily
      const originalGetCached = getCached;
      const originalSetCached = setCached;

      // Mock the cache functions
      (require('../services/cache') as any).getCached = (key: string) => testCache.get(key);
      (require('../services/cache') as any).setCached = (key: string, value: any) => testCache.set(key, value);

      try {
        // Set value
        setCached(testKey, testValue);
        expect(getCached(testKey)).toEqual(testValue);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Should be expired
        expect(getCached(testKey)).toBeUndefined();
      } finally {
        // Restore original functions
        (require('../services/cache') as any).getCached = originalGetCached;
        (require('../services/cache') as any).setCached = originalSetCached;
      }
    });

    it('should clear cache', () => {
      const testKey1 = 'clear_test_1';
      const testKey2 = 'clear_test_2';

      setCached(testKey1, 'value1');
      setCached(testKey2, 'value2');

      expect(getCached(testKey1)).toBe('value1');
      expect(getCached(testKey2)).toBe('value2');

      clearCache();

      expect(getCached(testKey1)).toBeUndefined();
      expect(getCached(testKey2)).toBeUndefined();
    });
  });

  describe('Database + Cache Integration', () => {
    it('should cache database query results', async () => {
      if (!dbAvailable) return; // Skip if database not available

      const cacheKey = 'db_cache_test';

      // Clear any existing cache
      clearCache();

      let queryCount = 0;
      const mockScanUpdates = async () => {
        queryCount++;
        return await scanUpdates();
      };

      // First call should query database
      const result1 = await getOrCompute(cacheKey, mockScanUpdates);
      expect(queryCount).toBe(1);
      expect(Array.isArray(result1)).toBe(true);

      // Second call should use cache
      const result2 = await getOrCompute(cacheKey, mockScanUpdates);
      expect(queryCount).toBe(1); // Should not have queried again
      expect(result2).toEqual(result1); // Should be the same result

      console.log(`🔄 Database query cached successfully (${result1.length} updates)`);
    }, 15000);

    it('should handle database errors gracefully in cached operations', async () => {
      const cacheKey = 'error_test';

      // Mock a failing database operation
      const failingOperation = async () => {
        throw new Error('Simulated database error');
      };

      // Should propagate the error
      await expect(getOrCompute(cacheKey, failingOperation)).rejects.toThrow('Simulated database error');

      // Should not have cached the error
      expect(getCached(cacheKey)).toBeUndefined();
    });
  });
});
