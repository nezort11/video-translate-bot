"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

interface NewUsersChartProps {
  data: Array<{ date: string; count: number }>;
  loading?: boolean;
  className?: string;
}

export const NewUsersChart: React.FC<NewUsersChartProps> = ({
  data,
  loading = false,
  className,
}) => {
  if (loading) {
    return (
      <div
        className={cn("bg-card rounded-xl p-4 border border-border", className)}
      >
        <div className="skeleton h-5 w-32 rounded mb-4" />
        <div className="skeleton h-48 w-full rounded" />
      </div>
    );
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div
      className={cn("bg-card rounded-xl p-4 border border-border", className)}
    >
      <h3 className="text-sm font-medium text-muted-foreground mb-4">
        New Users per Day
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              dx={-8}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={formatDate}
              formatter={(value: number) => [value, "New Users"]}
              cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
            />
            <Bar
              dataKey="count"
              fill="hsl(var(--chart-2))"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
