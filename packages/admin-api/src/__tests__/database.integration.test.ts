/**
 * Database Integration Tests for Admin API
 * Tests all database operations including YDB connectivity and SQL aggregations
 *
 * These tests connect to the real YDB database and are expensive to run.
 *
 * To run integration tests:
 *   RUN_INTEGRATION_TESTS=true pnpm test --filter=admin-api
 *
 * By default, expensive YDB tests are skipped.
 */

import {
  getDriver,
  getUpdatesStats,
  countUpdates,
  getOverviewMetrics,
  getNewUsersTimeSeries,
  getDauHistory,
  getUsersList,
  getUserDetails,
} from "../services/ydb";
import { DatabaseTestUtils } from "./setup";

// Check if integration tests should run
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";

// Helper to conditionally skip expensive tests
const itIntegration = RUN_INTEGRATION_TESTS ? it : it.skip;

describe("Database Integration Tests", () => {
  let dbAvailable = false;

  beforeAll(async () => {
    if (RUN_INTEGRATION_TESTS) {
      // Check database connection quickly for tests
      dbAvailable = await DatabaseTestUtils.ensureDatabaseConnection();
      if (!dbAvailable) {
        console.warn(
          "⚠️  Database not available - skipping database integration tests"
        );
      }
    } else {
      console.log(
        "[database-test] Integration tests skipped. Set RUN_INTEGRATION_TESTS=true to enable."
      );
    }
  });

  describe("YDB Driver Connection", () => {
    itIntegration("should connect to YDB successfully", async () => {
      const driver = getDriver();

      // Test that driver can be created and is ready
      await expect(driver.ready(5000)).resolves.not.toThrow();
      expect(driver).toBeDefined();
    });

    itIntegration("should handle connection timeouts gracefully", async () => {
      const driver = getDriver();

      // This should not throw if already connected
      await expect(driver.ready(3000)).resolves.not.toThrow();
    });
  });

  describe("Database Query Operations", () => {
    itIntegration(
      "should count updates in database",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        const count = await countUpdates();

        expect(typeof count).toBe("number");
        expect(count).toBeGreaterThanOrEqual(0);

        console.log(`📊 Database contains ${count} total updates`);
      },
      20000
    ); // 20 second timeout for database count operation

    itIntegration(
      "should get updates stats (optimized - no row fetching)",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        const stats = await getUpdatesStats();

        expect(stats).toHaveProperty("totalCount");
        expect(stats).toHaveProperty("oldestUpdateId");
        expect(stats).toHaveProperty("newestUpdateId");
        expect(stats).toHaveProperty("dateRange");

        expect(typeof stats.totalCount).toBe("number");
        expect(stats.totalCount).toBeGreaterThanOrEqual(0);

        // If we have updates, validate ID structure
        if (stats.totalCount > 0) {
          expect(typeof stats.oldestUpdateId).toBe("number");
          expect(typeof stats.newestUpdateId).toBe("number");
          expect(stats.newestUpdateId).toBeGreaterThanOrEqual(
            stats.oldestUpdateId!
          );
        }

        console.log(
          `📈 Updates stats: ${stats.totalCount} total updates (range: ${stats.oldestUpdateId}-${stats.newestUpdateId})`
        );
      },
      15000
    );

    itIntegration(
      "should get updates stats with date filtering",
      async () => {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const now = new Date();

        const stats = await getUpdatesStats(oneDayAgo, now);

        expect(stats).toHaveProperty("totalCount");
        expect(stats).toHaveProperty("oldestUpdateId");
        expect(stats).toHaveProperty("newestUpdateId");
        expect(stats).toHaveProperty("dateRange");

        expect(typeof stats.totalCount).toBe("number");
        expect(stats.totalCount).toBeGreaterThanOrEqual(0);

        // Verify date range is set correctly
        expect(stats.dateRange.from).toBe(oneDayAgo.toISOString());
        expect(stats.dateRange.to).toBe(now.toISOString());

        // If we have updates in this range, validate structure
        if (stats.totalCount > 0) {
          expect(stats.oldestUpdateId).toBeTruthy();
          expect(stats.newestUpdateId).toBeTruthy();
        }

        console.log(
          `📅 Updates stats for last day: ${stats.totalCount} updates (all calculations done in YDB)`
        );
      },
      15000
    );

    itIntegration(
      "should handle edge cases in date ranges",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        // Test with a very narrow date range (1 hour)
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const stats = await getUpdatesStats(oneHourAgo, now);

        // Should not throw even with narrow date range
        expect(stats).toHaveProperty("totalCount");
        expect(typeof stats.totalCount).toBe("number");
        expect(stats.totalCount).toBeGreaterThanOrEqual(0);

        console.log(
          `✅ Edge case test (1 hour): ${stats.totalCount} updates (aggregation handled gracefully)`
        );
      },
      15000
    );
  });

  describe("SQL Aggregation Functions", () => {
    // Note: These tests require significant YDB resources and may fail on serverless tier
    // due to RESOURCE_EXHAUSTED when the updates table contains millions of rows.
    // The queries are correct but need dedicated YDB resources or a smaller dataset.

    itIntegration(
      "should get overview metrics with SQL aggregations",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

        const metrics = await getOverviewMetrics(from, to);

        expect(metrics).toHaveProperty("totalUniqueUsers");
        expect(metrics).toHaveProperty("newUsersCount");
        expect(metrics).toHaveProperty("messagesCount");
        expect(metrics).toHaveProperty("dau");
        expect(metrics).toHaveProperty("wau");
        expect(metrics).toHaveProperty("mau");
        expect(metrics).toHaveProperty("period");

        expect(typeof metrics.totalUniqueUsers).toBe("number");
        expect(typeof metrics.newUsersCount).toBe("number");
        expect(typeof metrics.messagesCount).toBe("number");
        expect(typeof metrics.dau).toBe("number");
        expect(typeof metrics.wau).toBe("number");
        expect(typeof metrics.mau).toBe("number");

        expect(metrics.totalUniqueUsers).toBeGreaterThanOrEqual(0);
        expect(metrics.messagesCount).toBeGreaterThanOrEqual(0);

        console.log(
          `📊 Overview Metrics: ${metrics.totalUniqueUsers} users, ${metrics.messagesCount} messages, DAU: ${metrics.dau}`
        );
      },
      60000
    );

    itIntegration(
      "should get new users time series",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        const to = new Date();
        const from = new Date(to.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago (reduced for serverless limits)

        const timeSeries = await getNewUsersTimeSeries(from, to);

        expect(Array.isArray(timeSeries)).toBe(true);

        // Should have data for each day in the range (1 day + potentially 2 days due to rounding)
        expect(timeSeries.length).toBeGreaterThanOrEqual(1);

        for (const point of timeSeries) {
          expect(point).toHaveProperty("date");
          expect(point).toHaveProperty("count");
          expect(typeof point.date).toBe("string");
          expect(typeof point.count).toBe("number");
          expect(point.count).toBeGreaterThanOrEqual(0);
        }

        console.log(
          `👥 New Users Time Series: ${timeSeries.length} data points`
        );
      },
      60000
    );

    itIntegration(
      "should get DAU history",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        const to = new Date();
        const from = new Date(to.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago (reduced for serverless limits)

        const history = await getDauHistory(from, to);

        expect(Array.isArray(history)).toBe(true);

        // Should have data for each day in the range (1 day + potentially 2 days due to rounding)
        expect(history.length).toBeGreaterThanOrEqual(1);

        for (const point of history) {
          expect(point).toHaveProperty("date");
          expect(point).toHaveProperty("count");
          expect(typeof point.date).toBe("string");
          expect(typeof point.count).toBe("number");
          expect(point.count).toBeGreaterThanOrEqual(0);
        }

        console.log(`📈 DAU History: ${history.length} data points`);
      },
      60000
    );

    itIntegration(
      "should get paginated users list",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        const to = new Date();
        const from = new Date(to.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago (reduced for serverless limits)

        const result = await getUsersList(
          from,
          to,
          10,
          0,
          "lastSeenAt",
          "desc"
        );

        expect(result).toHaveProperty("users");
        expect(result).toHaveProperty("total");
        expect(Array.isArray(result.users)).toBe(true);
        expect(typeof result.total).toBe("number");

        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.users.length).toBeLessThanOrEqual(10);

        // Check user structure if users exist
        if (result.users.length > 0) {
          const user = result.users[0];
          expect(user).toHaveProperty("userId");
          expect(user).toHaveProperty("firstSeenAt");
          expect(user).toHaveProperty("lastSeenAt");
          expect(user).toHaveProperty("messagesCount");
          expect(typeof user.userId).toBe("number");
          expect(typeof user.firstSeenAt).toBe("string");
          expect(typeof user.lastSeenAt).toBe("string");
          expect(typeof user.messagesCount).toBe("number");
        }

        console.log(
          `👥 Users List: ${result.users.length} users returned, total: ${result.total}`
        );
      },
      60000
    );

    itIntegration(
      "should handle pagination correctly",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        const to = new Date();
        const from = new Date(to.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago (reduced for serverless limits)

        // Get first page
        const page1 = await getUsersList(from, to, 5, 0, "userId", "asc");

        // Get second page
        const page2 = await getUsersList(from, to, 5, 5, "userId", "asc");

        expect(page1.total).toBe(page2.total); // Total should be the same

        // If there are enough users, pages should be different
        if (page1.total > 5) {
          expect(page1.users).not.toEqual(page2.users);
        }

        console.log(
          `📄 Pagination test: ${page1.users.length} users in page 1, ${page2.users.length} in page 2`
        );
      },
      60000
    );

    itIntegration(
      "should get user details",
      async () => {
        if (!dbAvailable) return; // Skip if database not available

        // Get a real user from the database first
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        const result = await getUsersList(from, to, 1, 0, "lastSeenAt", "desc");

        if (result.users.length === 0) {
          console.log("No users found to test user details");
          return;
        }

        const testUserId = result.users[0].userId;
        const userDetails = await getUserDetails(testUserId);

        if (userDetails) {
          expect(userDetails).toHaveProperty("userId");
          expect(userDetails).toHaveProperty("firstSeenAt");
          expect(userDetails).toHaveProperty("lastSeenAt");
          expect(userDetails).toHaveProperty("messagesCount");
          expect(userDetails).toHaveProperty("updateTypes");
          expect(typeof userDetails.updateTypes).toBe("object");
          console.log(
            `👤 User details for ${testUserId}: ${userDetails.messagesCount} messages`
          );
        }
      },
      60000
    );
  });
});
