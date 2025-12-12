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
  const { isAuthenticated, isLoading, error, login } = useAuth();
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Mock Telegram environment in development
        if (process.env.NODE_ENV === "development") {
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
            initDataRaw: new URLSearchParams([
              [
                "user",
                JSON.stringify({
                  id: 776696185,
                  first_name: "Admin",
                  last_name: "User",
                  username: "admin",
                  language_code: "en",
                  is_premium: true,
                  allows_write_to_pm: true,
                }),
              ],
              ["hash", "test_hash"],
              ["auth_date", String(Math.floor(Date.now() / 1000))],
              ["signature", "test"],
            ]).toString(),
            version: "7.2",
            platform: "tdesktop",
          });
        }

        const isTma = await isTMA();

        if (!isTma && process.env.NODE_ENV !== "development") {
          setInitError("This app must be opened from Telegram");
          setIsInitializing(false);
          return;
        }

        // Get initData from Telegram
        const launchParams = retrieveLaunchParams();
        const initDataRaw = launchParams.initDataRaw;

        if (!initDataRaw) {
          setInitError("No init data available");
          setIsInitializing(false);
          return;
        }

        // Authenticate with backend
        await login(initDataRaw);
        setIsInitializing(false);
      } catch (err: any) {
        console.error("Auth initialization error:", err);
        setInitError(err.response?.data?.error || err.message);
        setIsInitializing(false);
      }
    };

    if (!isAuthenticated && !isLoading) {
      initAuth();
    } else {
      setIsInitializing(false);
    }
  }, [isAuthenticated, isLoading, login]);

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
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

