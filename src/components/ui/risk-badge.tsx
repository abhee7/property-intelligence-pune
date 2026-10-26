"use client";

import React from "react";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

interface RiskBadgeProps {
  level: string | null | undefined;
  score?: number | null;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

export function RiskBadge({ level, score, showIcon = true, size = "md" }: RiskBadgeProps) {
  const normalizedLevel = (level || "UNKNOWN").toUpperCase();

  const configs: Record<
    string,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    MINIMAL: {
      label: "Minimal Risk",
      bg: "bg-emerald-500/12",
      text: "text-emerald-400",
      border: "border-emerald-500/25",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
    LOW: {
      label: "Low Risk",
      bg: "bg-[#3987e5]/12",
      text: "text-[#7fb0ee]",
      border: "border-[#3987e5]/25",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
    MODERATE: {
      label: "Moderate Risk",
      bg: "bg-amber-500/12",
      text: "text-amber-400",
      border: "border-amber-500/25",
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
    },
    HIGH: {
      label: "High Risk",
      bg: "bg-orange-500/12",
      text: "text-orange-400",
      border: "border-orange-500/25",
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
    },
    CRITICAL: {
      label: "Critical Risk",
      bg: "bg-rose-500/12",
      text: "text-rose-400",
      border: "border-rose-500/25",
      icon: <ShieldX className="w-3.5 h-3.5" />,
    },
    UNKNOWN: {
      label: "Unrated",
      bg: "bg-white/[0.06]",
      text: "text-platinum/45",
      border: "border-white/[0.12]",
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
    },
  };

  const config = configs[normalizedLevel] || configs.UNKNOWN;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };

  return (
    <span
      className={`pi-pill uppercase tracking-wider ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`}
    >
      {showIcon && config.icon}
      <span>{config.label}</span>
      {score !== undefined && score !== null && (
        <span className="font-extrabold ml-0.5 opacity-90">({score})</span>
      )}
    </span>
  );
}
