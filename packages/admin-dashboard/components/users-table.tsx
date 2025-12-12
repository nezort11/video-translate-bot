"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { UserItem } from "@/lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface UsersTableProps {
  users: UserItem[];
  loading?: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  loading = false,
  page,
  totalPages,
  total,
  onPageChange,
  className,
}) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-xl p-4 border border-border"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="skeleton h-5 w-24 rounded" />
                <div className="skeleton h-3 w-32 rounded" />
              </div>
              <div className="skeleton h-6 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <p className="text-muted-foreground">No users found</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Users list */}
      {users.map((user) => (
        <div
          key={user.userId}
          className="bg-card rounded-xl p-4 border border-border hover:border-primary/50 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">
                  {user.userId}
                </span>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {user.messagesCount} msgs
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                <p>
                  First seen:{" "}
                  <span className="text-foreground">
                    {formatDate(user.firstSeenAt)} {formatTime(user.firstSeenAt)}
                  </span>
                </p>
                <p>
                  Last seen:{" "}
                  <span className="text-foreground">
                    {formatDate(user.lastSeenAt)} {formatTime(user.lastSeenAt)}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} users total
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

