"use client";

import React, { useEffect, useState } from "react";
import {
  isTMA,
  mockTelegramEnv,
  retrieveLaunchParams,
} from "@telegram-apps/bridge";
import { useAuth } from "@/lib/auth-context";

interface AuthHandlerProps {
  children: React.ReactNode;
}

export const AuthHandler: React.FC<AuthHandlerProps> = ({ children }) => {
  const { isAuthenticated, isLoading, error, login, debugLogin } = useAuth();
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasAttemptedAuth, setHasAttemptedAuth] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // Prevent infinite retry loop
      if (hasAttemptedAuth) {
        console.log("[AuthHandler] Already attempted auth, skipping");
        return;
      }

      console.log("[AuthHandler] Starting authentication initialization");
      console.log(
        "[AuthHandler] API Base URL:",
        process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001"
      );
      setHasAttemptedAuth(true);

      try {
        // In development mode, use debug auth directly (skip Telegram validation)
        if (process.env.NODE_ENV === "development" && debugLogin) {
          console.log(
            "[AuthHandler] Development mode - using debug authentication"
          );
          // Mock Telegram theme for styling
          mockTelegramEnv({
            themeParams: {
              accentTextColor: "#6ab2f2",
              bgColor: "#17212b",
              buttonColor: "#5288c1",
              buttonTextColor: "#ffffff",
              destructiveTextColor: "#ec3942",
              headerBgColor: "#17212b",
              hintColor: "#708499",
              linkColor: "#6ab3f3",
              secondaryBgColor: "#232e3c",
              sectionBgColor: "#17212b",
              sectionHeaderTextColor: "#6ab3f3",
              subtitleTextColor: "#708499",
              textColor: "#f5f5f5",
            },
            initData: {
              user: {
                id: 776696185,
                firstName: "Admin",
                lastName: "User",
                username: "admin",
                languageCode: "en",
                isPremium: true,
                allowsWriteToPm: true,
              },
              hash: "test_hash",
              authDate: new Date(),
              signature: "test",
              startParam: "debug",
              chatType: "sender",
              chatInstance: "test",
            },
            initDataRaw: "",
            version: "7.2",
            platform: "tdesktop",
          });
          // Use debug auth endpoint instead of Telegram validation
          await debugLogin();
          console.log("[AuthHandler] Debug authentication successful");
          setIsInitializing(false);
          return;
        }

        const isTma = await isTMA();
        console.log("[AuthHandler] Is Telegram Mini App:", isTma);

        if (!isTma) {
          console.error("[AuthHandler] Not running in Telegram Mini App");
          setInitError("This app must be opened from Telegram");
          setIsInitializing(false);
          return;
        }

        // Get initData from Telegram
        const launchParams = retrieveLaunchParams();
        const initDataRaw = launchParams.initDataRaw;
        console.log("[AuthHandler] InitData length:", initDataRaw?.length || 0);

        if (!initDataRaw) {
          console.error("[AuthHandler] No initData available");
          setInitError("No init data available");
          setIsInitializing(false);
          return;
        }

        // Authenticate with backend
        console.log("[AuthHandler] Attempting to authenticate with backend");
        await login(initDataRaw);
        console.log("[AuthHandler] Authentication successful");
        setIsInitializing(false);
      } catch (err: unknown) {
        console.error("[AuthHandler] Auth initialization error:", err);
        const errorMessage =
          err instanceof Error &&
          typeof err === "object" &&
          err !== null &&
          "response" in err &&
          err.response &&
          typeof err.response === "object" &&
          "data" in err.response &&
          err.response.data &&
          typeof err.response.data === "object" &&
          "error" in err.response.data
            ? (err.response.data as { error: string }).error || err.message
            : err instanceof Error
              ? err.message
              : "Authentication failed";
        setInitError(errorMessage);
        setIsInitializing(false);
      }
    };

    if (!isAuthenticated && !isLoading && !hasAttemptedAuth) {
      console.log("[AuthHandler] Conditions met, initializing auth");
      initAuth();
    } else {
      console.log("[AuthHandler] Skipping auth init:", {
        isAuthenticated,
        isLoading,
        hasAttemptedAuth,
      });
      setIsInitializing(false);
    }
  }, [isAuthenticated, isLoading, hasAttemptedAuth, login, debugLogin]);

  // Loading state
  if (isInitializing || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (initError || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Authentication Failed</h2>
          <p className="text-muted-foreground text-sm">{initError || error}</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground text-sm">
            Please open this app from Telegram to authenticate.
          </p>
          {process.env.NODE_ENV === "development" && debugLogin && (
            <button
              onClick={debugLogin}
              disabled={isLoading}
              className="mt-6 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm font-medium transition disabled:opacity-50"
            >
              {isLoading ? "Authenticating..." : "🔧 Dev Debug Login"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
