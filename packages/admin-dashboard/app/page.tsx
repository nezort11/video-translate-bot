"use client";

import React, { useEffect, useState, useCallback } from "react";
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

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [dauHistory, setDauHistory] = useState<DailyData[]>([]);
  const [newUsersHistory, setNewUsersHistory] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Calculate date range (last 30 days)
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [overviewData, dauData, newUsersData] = await Promise.all([
        getOverviewMetrics(from.toISOString(), to.toISOString()),
        getDauHistory(from.toISOString(), to.toISOString()),
        getNewUsersData(from.toISOString(), to.toISOString()),
      ]);

      setMetrics(overviewData);
      setDauHistory(dauData.data);
      setNewUsersHistory(newUsersData.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: unknown) {
      console.error("Failed to fetch dashboard data:", err);
      const errorMessage = err instanceof Error && typeof err === 'object' && err !== null && 'response' in err && err.response && typeof err.response === 'object' && 'data' in err.response && err.response.data && typeof err.response.data === 'object' && 'error' in err.response.data
        ? (err.response.data as { error: string }).error || err.message
        : err instanceof Error ? err.message : "Failed to load data";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60 seconds when page is visible
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const startRefresh = () => {
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchData();
        }
      }, 60000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchData(); // Refresh immediately when page becomes visible
      }
    };

    startRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchData]);

  if (error && !metrics) {
    return (
      <div className="p-4">
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-center">
          <p className="font-medium">Error loading dashboard</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchData}
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
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
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

