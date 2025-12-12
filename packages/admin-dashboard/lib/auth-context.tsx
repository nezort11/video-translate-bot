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
    setIsLoading(true);
    setError(null);

    try {
      const response: AuthResponse = await authenticateWithTelegram(initData);
      setAuthToken(response.token);
      setUser(response.user);
      setIsAuthenticated(true);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || "Authentication failed";
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

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        error,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

