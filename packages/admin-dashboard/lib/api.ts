import axios, { AxiosInstance, AxiosError } from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

// API Response Types
export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
  };
}

export interface OverviewMetrics {
  totalUniqueUsers: number;
  newUsersCount: number;
  messagesCount: number;
  dau: number;
  wau: number;
  mau: number;
  period: {
    from: string;
    to: string;
  };
}

export interface DailyData {
  date: string;
  count: number;
}

export interface NewUsersResponse {
  data: DailyData[];
  period: {
    from: string;
    to: string;
  };
}

export interface DauHistoryResponse {
  data: DailyData[];
  period: {
    from: string;
    to: string;
  };
}

export interface ActiveUsersResponse {
  period: string;
  days: number;
  activeUsers: number;
  from: string;
  to: string;
}

export interface UserItem {
  userId: number;
  firstSeenAt: string;
  lastSeenAt: string;
  messagesCount: number;
}

export interface UsersResponse {
  items: UserItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  period: {
    from: string;
    to: string;
  };
}

// Create API client
let apiClient: AxiosInstance | null = null;
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    sessionStorage.setItem("admin_token", token);
  } else {
    sessionStorage.removeItem("admin_token");
  }
};

export const getAuthToken = (): string | null => {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = sessionStorage.getItem("admin_token");
  }
  return authToken;
};

export const getApiClient = (): AxiosInstance => {
  if (!apiClient) {
    apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
    });

    // Add auth header interceptor
    apiClient.interceptors.request.use((config) => {
      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle 401 errors
    apiClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          setAuthToken(null);
          // Trigger re-auth - will be handled by auth context
          window.dispatchEvent(new CustomEvent("auth:expired"));
        }
        return Promise.reject(error);
      }
    );
  }
  return apiClient;
};

// Auth API
export const authenticateWithTelegram = async (
  initData: string
): Promise<AuthResponse> => {
  const response = await getApiClient().post<AuthResponse>(
    "/api/auth/telegram-init",
    { initData }
  );
  return response.data;
};

// Metrics API
export const getOverviewMetrics = async (
  from?: string,
  to?: string
): Promise<OverviewMetrics> => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const response = await getApiClient().get<OverviewMetrics>(
    `/api/metrics/overview?${params}`
  );
  return response.data;
};

export const getNewUsersData = async (
  from?: string,
  to?: string
): Promise<NewUsersResponse> => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const response = await getApiClient().get<NewUsersResponse>(
    `/api/metrics/new-users?${params}`
  );
  return response.data;
};

export const getDauHistory = async (
  from?: string,
  to?: string
): Promise<DauHistoryResponse> => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const response = await getApiClient().get<DauHistoryResponse>(
    `/api/metrics/dau-history?${params}`
  );
  return response.data;
};

export const getActiveUsers = async (
  period: "1d" | "7d" | "30d" = "7d"
): Promise<ActiveUsersResponse> => {
  const response = await getApiClient().get<ActiveUsersResponse>(
    `/api/metrics/active?period=${period}`
  );
  return response.data;
};

// Users API
export const getUsers = async (
  page = 1,
  limit = 50,
  from?: string,
  to?: string
): Promise<UsersResponse> => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const response = await getApiClient().get<UsersResponse>(
    `/api/users?${params}`
  );
  return response.data;
};

