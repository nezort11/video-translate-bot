"use client";

import React, { useState, useMemo, useCallback } from "react";
import { UsersTable } from "@/components/users-table";
import { getUsers, UserItem } from "@/lib/api";
import { Search } from "lucide-react";
import { useDataCache, invalidateCache } from "@/lib/use-data-cache";

interface UsersData {
  items: UserItem[];
  page: number;
  totalPages: number;
  total: number;
}

const ITEMS_PER_PAGE = 20;

export default function UsersPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  // Memoize the date range to avoid recalculating on every render
  const { from, to } = useMemo(() => {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }, []);

  // Create a cache key that includes the current page
  const cacheKey = useMemo(() => `users-page-${currentPage}`, [currentPage]);

  // Memoize the fetcher for the current page
  const fetcher = useMemo(
    () => async (): Promise<UsersData> => {
      const response = await getUsers(currentPage, ITEMS_PER_PAGE, from, to);
      return {
        items: response.items,
        page: response.page,
        totalPages: response.totalPages,
        total: response.total,
      };
    },
    [currentPage, from, to]
  );

  const { data, isLoading, error, refetch } = useDataCache<UsersData>({
    cacheKey,
    fetcher,
    staleTime: 2 * 60 * 1000, // 2 minutes for users list (more dynamic)
    refetchOnFocus: false, // Don't auto-refetch users list on focus
  });

  const users = data?.items ?? [];
  const page = data?.page ?? currentPage;
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const loading = isLoading;

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setCurrentPage(newPage);
      }
    },
    [totalPages]
  );

  // Refetch current page and invalidate other pages
  const handleRefetch = useCallback(() => {
    // Invalidate all user pages to ensure fresh data
    for (let i = 1; i <= totalPages; i++) {
      if (i !== currentPage) {
        invalidateCache(`users-page-${i}`);
      }
    }
    refetch();
  }, [currentPage, totalPages, refetch]);

  // Filter users by search query (client-side for now)
  const filteredUsers = searchQuery
    ? users.filter((user) => String(user.userId).includes(searchQuery))
    : users;

  if (error && users.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-center">
          <p className="font-medium">Error loading users</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={handleRefetch}
            className="mt-3 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">
            View and manage bot users
          </p>
        </div>
        <button
          onClick={handleRefetch}
          disabled={loading}
          className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by user ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-secondary border border-border rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">
            {total.toLocaleString()} total users
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-chart-2" />
          <span className="text-muted-foreground">Last 30 days</span>
        </div>
      </div>

      {/* Table */}
      <UsersTable
        users={filteredUsers}
        loading={loading}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={handlePageChange}
      />

      {/* Error toast */}
      {error && users.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 bg-destructive/90 text-destructive-foreground rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
