"use client";

import React from "react";

interface StatusBadgeProps {
  status: string | null | undefined;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const normalized = (status || "DRAFT").toUpperCase();

  const configs: Record<string, { label: string; bg: string; dot: string }> = {
    VERIFIED: {
      label: "Verified",
      bg: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25",
      dot: "bg-emerald-400",
    },
    LISTED: {
      label: "Listed",
      bg: "bg-[#3987e5]/12 text-[#7fb0ee] border-[#3987e5]/25",
      dot: "bg-[#3987e5]",
    },
    UNDER_VERIFICATION: {
      label: "Under Review",
      bg: "bg-amber-500/12 text-amber-400 border-amber-500/25",
      dot: "bg-amber-400",
    },
    FLAGGED: {
      label: "Flagged",
      bg: "bg-rose-500/12 text-rose-400 border-rose-500/25",
      dot: "bg-rose-400",
    },
    DRAFT: {
      label: "Draft",
      bg: "bg-white/[0.06] text-platinum/45 border-white/[0.12]",
      dot: "bg-platinum/45",
    },
    ACTIVE: {
      label: "Active",
      bg: "bg-[#3987e5]/12 text-[#7fb0ee] border-[#3987e5]/25",
      dot: "bg-[#3987e5]",
    },
    DISPOSED: {
      label: "Disposed",
      bg: "bg-violet-500/12 text-violet-400 border-violet-500/25",
      dot: "bg-violet-400",
    },
    COMPLETED: {
      label: "Completed",
      bg: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25",
      dot: "bg-emerald-400",
    },
    PENDING: {
      label: "Pending",
      bg: "bg-amber-500/12 text-amber-400 border-amber-500/25",
      dot: "bg-amber-400",
    },
  };

  const config = configs[normalized] || {
    label: normalized.replace("_", " "),
    bg: "bg-white/[0.06] text-platinum/45 border-white/[0.12]",
    dot: "bg-platinum/45",
  };

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span className={`pi-pill uppercase tracking-wider ${config.bg} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
}
