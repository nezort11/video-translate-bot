/**
 * Integration tests for Admin API endpoints using Jest
 * Tests all major API endpoints including auth, metrics, and users
 */

import { request, TestUtils, DatabaseTestUtils } from "./setup";

describe("Admin API Integration Tests", () => {
  let authToken: string;
  let authorizedRequest: any;
  let dbAvailable = false;

  beforeAll(async () => {
    // Check database availability for tests that need it
    dbAvailable = await DatabaseTestUtils.ensureDatabaseConnection();
    console.log(`[admin-api-test] Database available: ${dbAvailable}`);
  });

  describe("Health Check", () => {
    it("should return ok status", async () => {
      const response = await request.get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
    });
  });

  describe("Authentication", () => {
    // Skip Telegram auth test as initData may be expired/invalid
    it.skip("should authenticate with Telegram initData", async () => {
      const authResponse = await TestUtils.authenticateTelegram();

      expect(authResponse.token).toBeDefined();
      expect(authResponse.user).toBeDefined();
      expect(authResponse.user.id).toBe(776696185);
      expect(authResponse.user.username).toBe("nezort11");

      // Store token for subsequent tests
      authToken = authResponse.token;
      authorizedRequest = TestUtils.getAuthorizedRequest(authToken);
    });

    it("should authenticate with debug endpoint", async () => {
      const authResponse = await TestUtils.authenticateDebug();

      expect(authResponse.token).toBeDefined();
      expect(authResponse.user).toBeDefined();
      expect(authResponse.user.id).toBe(776696185);
      expect(authResponse.user.username).toBe("admin");

      // Store token for subsequent tests
      authToken = authResponse.token;
      authorizedRequest = TestUtils.getAuthorizedRequest(authToken);
    });
  });

  describe("Metrics Endpoints (Authenticated)", () => {
    beforeAll(async () => {
      // Ensure we have authentication for these tests
      if (!authToken) {
        const authResponse = await TestUtils.authenticateDebug();
        authToken = authResponse.token;
        authorizedRequest = TestUtils.getAuthorizedRequest(authToken);
      }
    });

    it("should get metrics overview", async () => {
      if (!dbAvailable) return; // Skip if database not available

      const response = await authorizedRequest.get("/api/metrics/overview");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("totalUniqueUsers");
      expect(response.body).toHaveProperty("messagesCount");
      expect(response.body).toHaveProperty("dau");
      expect(response.body).toHaveProperty("wau");
      expect(response.body).toHaveProperty("mau");

      // Validate data types
      expect(typeof response.body.totalUniqueUsers).toBe("number");
      expect(typeof response.body.messagesCount).toBe("number");
      expect(typeof response.body.dau).toBe("number");
      expect(typeof response.body.wau).toBe("number");
      expect(typeof response.body.mau).toBe("number");

      // Ensure we have real data
      expect(response.body.totalUniqueUsers).toBeGreaterThanOrEqual(0);
      expect(response.body.messagesCount).toBeGreaterThanOrEqual(0);

      console.log(
        `📊 Metrics Overview: ${response.body.totalUniqueUsers} users, ${response.body.messagesCount} messages, DAU: ${response.body.dau}`
      );
    });

    it("should get new users metrics", async () => {
      if (!dbAvailable) return; // Skip if database not available

      const response = await authorizedRequest.get("/api/metrics/new-users");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(Array.isArray(response.body.data)).toBe(true);

      // Check data structure - may be empty but should be valid array
      for (const item of response.body.data) {
        expect(item).toHaveProperty("date");
        expect(item).toHaveProperty("count");
        expect(typeof item.count).toBe("number");
        expect(item.count).toBeGreaterThanOrEqual(0);
      }

      console.log(
        `👥 New Users Data: ${response.body.data.length} data points`
      );
    });

    it("should get active users metrics", async () => {
      if (!dbAvailable) return; // Skip if database not available

      const response = await authorizedRequest.get(
        "/api/metrics/active?period=7d"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("activeUsers");
      expect(response.body).toHaveProperty("days");

      expect(typeof response.body.activeUsers).toBe("number");
      expect(typeof response.body.days).toBe("number");
      expect(response.body.activeUsers).toBeGreaterThanOrEqual(0);
      expect(response.body.days).toBe(7);

      console.log(`📊 Active Users (7d): ${response.body.activeUsers} users`);
    });

    it("should get DAU history", async () => {
      if (!dbAvailable) return; // Skip if database not available

      const response = await authorizedRequest.get("/api/metrics/dau-history");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(Array.isArray(response.body.data)).toBe(true);

      // Check data structure - may be empty but should be valid array
      for (const item of response.body.data) {
        expect(item).toHaveProperty("date");
        expect(item).toHaveProperty("count");
        expect(typeof item.count).toBe("number");
        expect(item.count).toBeGreaterThanOrEqual(0);
      }

      console.log(`📈 DAU History: ${response.body.data.length} data points`);
    });
  });

  describe("Users Endpoints (Authenticated)", () => {
    beforeAll(async () => {
      // Ensure we have authentication for these tests
      if (!authToken) {
        const authResponse = await TestUtils.authenticateDebug();
        authToken = authResponse.token;
        authorizedRequest = TestUtils.getAuthorizedRequest(authToken);
      }
    });

    it("should get users list", async () => {
      if (!dbAvailable) return; // Skip if database not available
      const response = await authorizedRequest.get("/api/users?page=1&limit=5");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("items");
      expect(response.body).toHaveProperty("total");
      expect(response.body).toHaveProperty("page");

      expect(Array.isArray(response.body.items)).toBe(true);
      expect(typeof response.body.total).toBe("number");
      expect(typeof response.body.page).toBe("number");
      expect(response.body.page).toBe(1);

      // Should have users data
      expect(response.body.total).toBeGreaterThanOrEqual(0);

      // Check user structure if users exist
      if (response.body.items.length > 0) {
        const firstUser = response.body.items[0];
        expect(firstUser).toHaveProperty("userId");
        expect(firstUser).toHaveProperty("firstSeenAt");
        expect(firstUser).toHaveProperty("lastSeenAt");
        expect(typeof firstUser.userId).toBe("number");
        expect(typeof firstUser.firstSeenAt).toBe("string");
        expect(typeof firstUser.lastSeenAt).toBe("string");
      }

      console.log(
        `👥 Users List: ${response.body.items.length} users returned, total: ${response.body.total}`
      );
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for unknown endpoints", async () => {
      const response = await request.get("/api/unknown-endpoint");

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("error", "Not found");
    });

    it("should require authentication for protected endpoints", async () => {
      const response = await request.get("/api/metrics/overview");

      expect(response.status).toBe(401);
    });
  });
});
