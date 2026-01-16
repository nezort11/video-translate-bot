"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  authenticateWithTelegram,
  debugAuth,
  setAuthToken,
  getAuthToken,
  AuthResponse,
} from "./api";

interface User {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
  login: (initData: string) => Promise<void>;
  logout: () => void;
  debugLogin?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for existing token on mount
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      // TODO: Validate token by making a test API call
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  // Listen for auth expiration
  useEffect(() => {
    const handleAuthExpired = () => {
      setIsAuthenticated(false);
      setUser(null);
      setError("Session expired. Please re-open the app.");
    };

    window.addEventListener("auth:expired", handleAuthExpired);
    return () => window.removeEventListener("auth:expired", handleAuthExpired);
  }, []);

  const login = useCallback(async (initData: string) => {
    console.log("[AuthContext] Login attempt starting");
    setIsLoading(true);
    setError(null);

    try {
      console.log("[AuthContext] Calling authenticateWithTelegram");
      const response: AuthResponse = await authenticateWithTelegram(initData);
      console.log("[AuthContext] Authentication successful:", {
        userId: response.user.id,
        username: response.user.username,
        expiresAt: response.expiresAt,
      });
      setAuthToken(response.token);
      setUser(response.user);
      setIsAuthenticated(true);
    } catch (err: unknown) {
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
      console.error("[AuthContext] Authentication failed:", err);
      setError(errorMessage);
      setIsAuthenticated(false);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const debugLoginFn = useCallback(async () => {
    if (process.env.NODE_ENV !== "development") return;
    console.log("[AuthContext] Debug login attempt");
    setIsLoading(true);
    setError(null);

    try {
      const response: AuthResponse = await debugAuth();
      console.log("[AuthContext] Debug authentication successful");
      setAuthToken(response.token);
      setUser(response.user);
      setIsAuthenticated(true);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error &&
        typeof err === "object" &&
        err !== null &&
        "response" in err.response &&
        typeof err.response === "object" &&
        "data" in err.response &&
        err.response.data &&
        typeof err.response.data === "object" &&
        "error" in err.response.data
          ? (err.response.data as { error: string }).error || err.message
          : err instanceof Error
            ? err.message
            : "Debug authentication failed";
      console.error("[AuthContext] Debug authentication failed:", errorMessage);
      setError(errorMessage);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        error,
        login,
        logout,
        debugLogin:
          process.env.NODE_ENV === "development" ? debugLoginFn : undefined,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
