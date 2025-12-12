"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  loading?: boolean;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  loading = false,
  className,
}) => {
  if (loading) {
    return (
      <div
        className={cn(
          "bg-card rounded-xl p-4 border border-border",
          className
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-8 w-8 rounded-lg" />
        </div>
        <div className="skeleton h-8 w-20 rounded mb-1" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card rounded-xl p-4 border border-border transition-colors hover:border-primary/50",
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {Icon && (
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trend.value >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}%
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
};

interface KpiGridProps {
  children: React.ReactNode;
  className?: string;
}

export const KpiGrid: React.FC<KpiGridProps> = ({ children, className }) => {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>{children}</div>
  );
};

