/**
 * Database Integration Tests for trackNewUser
 *
 * These tests connect to the real YDB database and are expensive to run.
 *
 * To run integration tests:
 *   RUN_INTEGRATION_TESTS=true pnpm test src/__tests__/db.integration.test.ts
 *
 * By default, expensive YDB tests are skipped.
 */

import { driver, trackNewUserForTesting } from "../db";
import type { Update } from "telegraf/types";

// Check if integration tests should run
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";

// Helper to conditionally skip expensive tests
const itIntegration = RUN_INTEGRATION_TESTS ? it : it.skip;

describe("Database Integration Tests - trackNewUser", () => {
  let dbAvailable = false;

  beforeAll(async () => {
    if (RUN_INTEGRATION_TESTS) {
      // Check database connection
      try {
        console.log("[db-test] Attempting database connection...");
        await driver.ready(5000);
        dbAvailable = true;
        console.log("[db-test] Database connection successful!");
      } catch (error) {
        console.warn(
          "[db-test] Database connection failed:",
          error instanceof Error ? error.message : String(error)
        );
        dbAvailable = false;
      }
    } else {
      console.log(
        "[db-test] Integration tests skipped. Set RUN_INTEGRATION_TESTS=true to enable."
      );
    }
  });

  afterAll(async () => {
    // Close driver connection to allow Jest to exit cleanly
    if (RUN_INTEGRATION_TESTS) {
      try {
        await driver.destroy();
        console.log("[db-test] Driver connection closed.");
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  describe("trackNewUser YQL Query", () => {
    itIntegration(
      "should insert new user without YQL syntax error (Filtering is not allowed without FROM)",
      async () => {
        if (!dbAvailable) {
          console.warn("⚠️ Database not available - skipping test");
          return;
        }

        // Create a mock Telegram update with user info
        // Use a test user ID that won't conflict with real users (negative IDs are not valid in Telegram)
        // We use a large random number to avoid conflicts
        const testUserId = Math.floor(Math.random() * 1000000) + 9000000000; // 9 billion+ range
        const testTimestamp = Math.floor(Date.now() / 1000);

        const mockUpdate: Update = {
          update_id: Math.floor(Math.random() * 1000000),
          message: {
            message_id: 1,
            date: testTimestamp,
            chat: {
              id: testUserId,
              type: "private",
              first_name: "TestUser",
            },
            from: {
              id: testUserId,
              is_bot: false,
              first_name: "TestUser",
              last_name: "Integration",
              username: `test_user_${testUserId}`,
              language_code: "en",
            },
            text: "test message",
          },
        };

        // This should NOT throw "Filtering is not allowed without FROM" error
        // The fix uses AS_TABLE to create a virtual table for WHERE filtering
        await expect(
          trackNewUserForTesting(mockUpdate, testTimestamp)
        ).resolves.not.toThrow();

        console.log(
          `✅ trackNewUser executed successfully for test user ${testUserId}`
        );

        // Clean up: delete the test user we created
        try {
          await driver.tableClient.withSessionRetry(async (session) => {
            await session.executeQuery(
              `DELETE FROM users WHERE user_id = ${testUserId};`
            );
          });
          console.log(`🧹 Cleaned up test user ${testUserId}`);
        } catch (cleanupError) {
          console.warn(
            `⚠️ Failed to clean up test user ${testUserId}:`,
            cleanupError
          );
        }
      },
      30000
    ); // 30 second timeout
  });
});
