import type { CSSProperties } from "react";

// Platinum-glass dark chart theme. Categorical + status hues are the
// dataviz-skill validated dark-surface steps — do not re-step individual
// values without re-running the palette validator.

export const CHART_SERIES = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
] as const;

export const CHART_STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const CHART_INK = {
  primary: "#F4F6FA",
  secondary: "rgba(244,246,250,0.62)",
  muted: "rgba(244,246,250,0.38)",
  grid: "rgba(244,246,250,0.07)",
  axis: "rgba(244,246,250,0.14)",
};

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "rgba(14,15,19,0.92)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "12px",
  color: CHART_INK.primary,
  fontSize: "12.5px",
  fontFamily: "var(--font-inter, Inter), sans-serif",
  boxShadow: "0 20px 44px -16px rgba(0,0,0,0.7)",
  padding: "10px 13px",
};

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: CHART_INK.secondary,
  fontSize: "11px",
  fontWeight: 600,
  marginBottom: "4px",
};

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: CHART_INK.primary,
  fontSize: "12.5px",
  padding: 0,
};

// Risk severity: ordinal ramp from calm (minimal) through the reserved
// status hues to critical.
export const RISK_COLORS: Record<string, string> = {
  MINIMAL: "#199e70",
  LOW: "#0ca30c",
  MODERATE: "#fab219",
  HIGH: "#ec835a",
  CRITICAL: "#d03b3b",
  UNKNOWN: "rgba(244,246,250,0.35)",
};

// Property lifecycle status: categorical identity, not severity.
export const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "#0ca30c",
  COMPLETED: "#0ca30c",
  LISTED: "#3987e5",
  ACTIVE: "#3987e5",
  UNDER_VERIFICATION: "#fab219",
  PENDING: "#fab219",
  FLAGGED: "#d03b3b",
  DRAFT: "rgba(244,246,250,0.35)",
  DISPOSED: "#9085e9",
};
