"use client";

import React, { useMemo } from "react";
import { Users, UserPlus, MessageSquare, TrendingUp } from "lucide-react";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { DauChart } from "@/components/charts/dau-chart";
import { NewUsersChart } from "@/components/charts/new-users-chart";
import {
  getOverviewMetrics,
  getDauHistory,
  getNewUsersData,
  OverviewMetrics,
  DailyData,
} from "@/lib/api";
import { useDataCache } from "@/lib/use-data-cache";

interface DashboardData {
  metrics: OverviewMetrics;
  dauHistory: DailyData[];
  newUsersHistory: DailyData[];
}

export default function DashboardPage() {
  // Memoize the date range to avoid recalculating on every render
  const { from, to } = useMemo(() => {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }, []);

  // Memoize the fetcher to avoid creating new function references
  const fetcher = useMemo(
    () => async (): Promise<DashboardData> => {
      const [overviewData, dauData, newUsersData] = await Promise.all([
        getOverviewMetrics(from, to),
        getDauHistory(from, to),
        getNewUsersData(from, to),
      ]);

      return {
        metrics: overviewData,
        dauHistory: dauData.data,
        newUsersHistory: newUsersData.data,
      };
    },
    [from, to]
  );

  const { data, isLoading, isRefreshing, error, refetch, lastUpdated } =
    useDataCache<DashboardData>({
      cacheKey: "dashboard-overview",
      fetcher,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnFocus: true, // Refetch when tab becomes visible (debounced)
      autoRefresh: true, // Enable auto-refresh
      autoRefreshInterval: 60000, // Every 60 seconds
    });

  const metrics = data?.metrics ?? null;
  const dauHistory = data?.dauHistory ?? [];
  const newUsersHistory = data?.newUsersHistory ?? [];
  const loading = isLoading;

  if (error && !metrics) {
    return (
      <div className="p-4">
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-center">
          <p className="font-medium">Error loading dashboard</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={refetch}
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
          <h1 className="text-xl font-bold">Dashboard</h1>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
              {isRefreshing && " • Refreshing..."}
            </p>
          )}
        </div>
        <button
          onClick={refetch}
          disabled={loading || isRefreshing}
          className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${loading || isRefreshing ? "animate-spin" : ""}`}
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

      {/* KPI Cards */}
      <KpiGrid>
        <KpiCard
          title="Total Users"
          value={metrics?.totalUniqueUsers ?? 0}
          icon={Users}
          subtitle="All time"
          loading={loading}
        />
        <KpiCard
          title="New Users"
          value={metrics?.newUsersCount ?? 0}
          icon={UserPlus}
          subtitle="Last 30 days"
          loading={loading}
        />
        <KpiCard
          title="DAU"
          value={metrics?.dau ?? 0}
          icon={TrendingUp}
          subtitle="Today"
          loading={loading}
        />
        <KpiCard
          title="Messages"
          value={metrics?.messagesCount ?? 0}
          icon={MessageSquare}
          subtitle="Last 30 days"
          loading={loading}
        />
      </KpiGrid>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">WAU (7 days)</p>
          {loading ? (
            <div className="skeleton h-6 w-16 rounded" />
          ) : (
            <p className="text-lg font-bold">
              {(metrics?.wau ?? 0).toLocaleString()}
            </p>
          )}
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">MAU (30 days)</p>
          {loading ? (
            <div className="skeleton h-6 w-16 rounded" />
          ) : (
            <p className="text-lg font-bold">
              {(metrics?.mau ?? 0).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Charts */}
      <DauChart data={dauHistory} loading={loading} />
      <NewUsersChart data={newUsersHistory} loading={loading} />

      {/* Error toast */}
      {error && metrics && (
        <div className="fixed bottom-20 left-4 right-4 bg-destructive/90 text-destructive-foreground rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
