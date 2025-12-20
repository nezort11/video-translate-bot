import { app } from "../app";
import supertest from "supertest";
import { getDriver } from "../services/ydb";
import { clearCache } from "../services/cache";

// Create a test agent for the app
export const request = supertest(app);

// Note: Tests now use debug authentication endpoint instead of real Telegram initData

// Database test utilities
export class DatabaseTestUtils {
  static async ensureDatabaseConnection(): Promise<boolean> {
    try {
      console.log("[test] Attempting database connection...");
      const driver = getDriver();
      console.log("[test] Driver created, calling ready()...");
      await driver.ready(5000); // 5 second timeout for tests
      console.log("[test] Database connection successful!");
      return true;
    } catch (error) {
      console.warn(
        "[test] Database connection failed:",
        error instanceof Error ? error.message : String(error)
      );
      console.warn("[test] Full error:", error);
      return false;
    }
  }

  static async cleanupTestCache(): Promise<void> {
    clearCache();
  }
}

export interface AuthToken {
  token: string;
  user: {
    id: number;
    username: string;
    first_name: string;
    last_name?: string;
  };
}

// Global test utilities
export class TestUtils {
  static async authenticateTelegram(): Promise<AuthToken> {
    // Use debug authentication for tests (avoids exposing real user data)
    const response = await request.post("/api/auth/debug");

    if (response.status !== 200) {
      throw new Error(
        `Debug authentication failed: ${response.status} - ${response.text}`
      );
    }

    if (!response.body.token) {
      throw new Error("No token received from debug authentication");
    }

    if (!response.body.user?.id) {
      throw new Error("No user data received from debug authentication");
    }

    return response.body as AuthToken;
  }

  static async authenticateDebug(): Promise<AuthToken> {
    const response = await request.post("/api/auth/debug");

    if (response.status !== 200) {
      throw new Error(
        `Debug authentication failed: ${response.status} - ${response.text}`
      );
    }

    if (!response.body.token) {
      throw new Error("No debug token received");
    }

    return response.body as AuthToken;
  }

  static getAuthorizedRequest(token: string) {
    return {
      get: (path: string) =>
        supertest(app).get(path).set("Authorization", `Bearer ${token}`),
      post: (path: string) =>
        supertest(app).post(path).set("Authorization", `Bearer ${token}`),
      put: (path: string) =>
        supertest(app).put(path).set("Authorization", `Bearer ${token}`),
      delete: (path: string) =>
        supertest(app).delete(path).set("Authorization", `Bearer ${token}`),
    };
  }
}
