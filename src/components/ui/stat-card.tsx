"use client";

import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: "brand" | "success" | "warning" | "error" | "orange";
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  subtitle,
  badgeText,
  badgeVariant = "brand",
}: StatCardProps) {
  const badgeColors = {
    brand: "bg-white/[0.08] text-platinum/75 border-white/[0.14]",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    error: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/25",
  };

  return (
    <div className="pi-card pi-card-interactive p-5 md:p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-platinum/45">
          {title}
        </span>
        <div className="pi-icon-tile w-10 h-10 text-platinum/80">
          {icon}
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <h3 className="font-sora text-2xl md:text-3xl font-extrabold text-platinum tracking-tight">
          {value}
        </h3>
        {badgeText && (
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeColors[badgeVariant]}`}>
            {badgeText}
          </span>
        )}
      </div>

      {(trend || subtitle) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={`flex items-center font-semibold ${
                trend.isPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowDownRight className="w-4 h-4" />
              )}
              {trend.value}
            </span>
          )}
          {subtitle && (
            <span className="text-platinum/40">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
