"use client";

import React, { useEffect, useState, useCallback } from "react";
import { UsersTable } from "@/components/users-table";
import { getUsers, UserItem } from "@/lib/api";
import { Search } from "lucide-react";

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const ITEMS_PER_PAGE = 20;

  const fetchUsers = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      // Calculate date range (last 30 days)
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      const response = await getUsers(
        pageNum,
        ITEMS_PER_PAGE,
        from.toISOString(),
        to.toISOString()
      );

      setUsers(response.items);
      setPage(response.page);
      setTotalPages(response.totalPages);
      setTotal(response.total);
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch users:", err);
      setError(err.response?.data?.error || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchUsers(newPage);
    }
  };

  // Filter users by search query (client-side for now)
  const filteredUsers = searchQuery
    ? users.filter((user) =>
        String(user.userId).includes(searchQuery)
      )
    : users;

  if (error && users.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-center">
          <p className="font-medium">Error loading users</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => fetchUsers(page)}
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
      <div>
        <h1 className="text-xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">
          View and manage bot users
        </p>
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

