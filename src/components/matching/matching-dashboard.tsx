// src/components/matching/matching-dashboard.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  GitMerge, AlertTriangle, CheckCircle2, XCircle, Clock,
  ChevronRight, Loader2, RefreshCw, Eye, Shield, ArrowRight, Check, X,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { RISK_COLORS, STATUS_COLORS, CHART_STATUS, CHART_SERIES } from "@/lib/chart-theme";

// ─── Data shape used by the cards ───

interface PropertyView {
  id: string;
  title: string;
  survey: string | null;
  status: string;
  price: number | null;
  area: number | null;
  village: string | null;
  owner: string | null;
  broker: string | null;
}

interface MatchView {
  id: string;
  score: number;
  type: string;
  confidence: string;
  status: string;
  propertyA: PropertyView;
  propertyB: PropertyView;
  factors: { name: string; score: number; detail: string }[];
  createdAt: string;
}

function toPropertyView(p: any): PropertyView {
  return {
    id: p.id,
    title: p.title,
    survey: p.surveyNumber,
    status: p.status,
    price: p.price,
    area: p.areaSqft,
    village: p.village,
    owner: p.ownerName,
    broker: p.brokerName,
  };
}

// API returns factor scores as 0–1; the bars below use 0–100
function toMatchView(m: any): MatchView {
  return {
    id: m.id,
    score: m.overallScore,
    type: m.matchType,
    confidence: m.confidence,
    status: m.status,
    propertyA: toPropertyView(m.propertyA),
    propertyB: toPropertyView(m.propertyB),
    factors: (m.factors || []).map((f: any) => ({ name: f.name, score: Math.round(f.score * 100), detail: f.detail })),
    createdAt: new Date(m.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  };
}

// ─── Config — colors reused verbatim from the chart-theme design system ───

const MUTED = "rgba(244,246,250,0.35)";

const TYPE_CFG: Record<string, { label: string; color: string; icon: any }> = {
  exact_duplicate: { label: "Exact duplicate", color: RISK_COLORS.CRITICAL, icon: AlertTriangle },
  likely_duplicate: { label: "Likely duplicate", color: RISK_COLORS.HIGH, icon: AlertTriangle },
  possible_match: { label: "Possible match", color: RISK_COLORS.MODERATE, icon: Eye },
  conflict: { label: "Ownership conflict", color: CHART_SERIES[6], icon: Shield },
  no_match: { label: "No match", color: MUTED, icon: Check },
};

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending review", color: STATUS_COLORS.PENDING },
  confirmed: { label: "Confirmed", color: STATUS_COLORS.FLAGGED },
  dismissed: { label: "Dismissed", color: MUTED },
  resolved: { label: "Resolved", color: STATUS_COLORS.VERIFIED },
};

const formatPrice = (n: number | null) => (n == null ? "—" : n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr` : `₹${(n / 100000).toFixed(0)} L`);
const formatArea = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("en-IN")} sq ft`);

// Overall match score reads like a risk score: a high score means these two
// listings are very likely the same property (duplicate/conflict risk).
function matchScoreColor(score: number) {
  if (score >= 80) return RISK_COLORS.CRITICAL;
  if (score >= 50) return RISK_COLORS.HIGH;
  return RISK_COLORS.LOW;
}

// Per-factor score reads like a confidence score: a high score means strong
// agreement between the two records on that specific attribute.
function factorScoreColor(score: number) {
  if (score >= 80) return CHART_STATUS.good;
  if (score >= 50) return CHART_STATUS.warning;
  if (score > 0) return CHART_STATUS.serious;
  return MUTED;
}

// Applies alpha to either a "#rrggbb" hex color or an existing rgba(...) string.
function withAlpha(color: string, alpha: number) {
  if (color.startsWith("rgba")) return color.replace(/[\d.]+\)$/, `${alpha})`);
  if (color.startsWith("#") && color.length === 7) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
    return `${color}${a}`;
  }
  return color;
}

// ─── Component ───

export default function MatchingDashboard() {
  const { getAccessToken } = useAuth();
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState("all");
  const [scanResult, setScanResult] = useState<{ created: number; updated: number; removed: number; pairs: number; ms: number } | null>(null);

  const authFetch = useCallback(
    (url: string, init: RequestInit = {}) => {
      const token = getAccessToken();
      return fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    },
    [getAccessToken],
  );

  const loadMatches = useCallback(async () => {
    try {
      const res = await authFetch("/api/matching?limit=100");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load matches");
      setMatches(json.data.matches.map(toMatchView));
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load matches");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  async function runScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await authFetch("/api/matching", { method: "POST", body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Scan failed");
      setScanResult({
        created: json.data.newMatches,
        updated: json.data.updatedMatches,
        removed: json.data.removedMatches,
        pairs: json.data.comparisonsScanned,
        ms: json.data.durationMs,
      });
      await loadMatches();
    } catch (err: any) {
      setError(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function resolveMatch(matchId: string, action: "confirmed" | "dismissed") {
    const res = await authFetch(`/api/matching/${matchId}`, { method: "PATCH", body: JSON.stringify({ action }) });
    const json = await res.json();
    if (!json.success) return setError(json.error || "Couldn't update the match");
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, status: action } : m)));
    setExpanded(null);
  }

  const filtered = filter === "all" ? matches : matches.filter((m) => (filter === "pending" ? m.status === "pending" : m.type === filter));
  const pendingCount = matches.filter((m) => m.status === "pending").length;

  const filterChips = [
    { key: "all", label: `All (${matches.length})` },
    { key: "pending", label: `Pending (${pendingCount})` },
    { key: "exact_duplicate", label: "Duplicates" },
    { key: "conflict", label: "Conflicts" },
    { key: "possible_match", label: "Possible" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight flex items-center gap-2.5">
            <span className="pi-icon-tile w-9 h-9 text-platinum/80">
              <GitMerge className="w-5 h-5" />
            </span>
            Matching Engine
          </h1>
          <p className="text-xs text-platinum/45 mt-1">
            Cross-reference properties · Detect duplicates · Flag conflicts
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="pi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sora font-bold text-xs uppercase tracking-wider disabled:opacity-60"
        >
          {scanning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning...
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" /> Run Full Scan
            </>
          )}
        </button>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className="pi-fade-up flex items-center justify-between gap-3 px-5 py-3 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 text-xs">
          <span className="text-emerald-300 flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Scan complete — {scanResult.pairs.toLocaleString("en-IN")} pairs checked in {(scanResult.ms / 1000).toFixed(1)}s · {scanResult.created} new, {scanResult.updated} refreshed, {scanResult.removed} cleared
          </span>
          <button
            onClick={() => setScanResult(null)}
            aria-label="Dismiss scan result"
            className="pi-icon-btn p-1 rounded-lg text-platinum/40 flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Matches"
          value={matches.length}
          icon={<GitMerge className="w-5 h-5 text-platinum/80" />}
          subtitle="Across scanned properties"
          badgeText="All"
          badgeVariant="brand"
        />
        <StatCard
          title="Pending Review"
          value={pendingCount}
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          subtitle="Awaiting admin action"
          badgeText="Pending"
          badgeVariant="warning"
        />
        <StatCard
          title="Exact Duplicates"
          value={matches.filter((m) => m.type === "exact_duplicate").length}
          icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
          subtitle="High-confidence duplicates"
          badgeText="Critical"
          badgeVariant="error"
        />
        <StatCard
          title="Conflicts"
          value={matches.filter((m) => m.type === "conflict").length}
          icon={<Shield className="w-5 h-5 text-violet-400" />}
          subtitle="Ownership disputes"
          badgeText="Legal"
          badgeVariant="brand"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {filterChips.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
              filter === f.key
                ? "bg-white/[0.12] text-platinum border-white/[0.2]"
                : "bg-transparent text-platinum/45 border-white/[0.08] hover:text-platinum/80 hover:border-white/[0.16]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-500/[0.07] border border-rose-500/25 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="pi-card p-10 text-center text-xs text-platinum/45">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading matches…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="pi-card p-10 text-center text-xs text-platinum/45">
          {matches.length === 0
            ? "No duplicate or conflicting records found. Run a full scan to check every property against the others."
            : "No matches in this category."}
        </div>
      )}

      {/* Match list */}
      <div className="space-y-3">
        {filtered.map((match, i) => {
          const tcfg = TYPE_CFG[match.type] || TYPE_CFG.no_match;
          const scfg = STATUS_CFG[match.status] || STATUS_CFG.pending;
          const isExpanded = expanded === match.id;
          const mColor = matchScoreColor(match.score);

          return (
            <div
              key={match.id}
              className="pi-card pi-card-interactive pi-fade-up overflow-hidden"
              style={{
                animationDelay: `${i * 0.05}s`,
                borderColor: isExpanded ? "rgba(255,255,255,0.2)" : undefined,
              }}
            >
              {/* Header */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : match.id)}
              >
                {/* Score circle */}
                <div
                  className="w-12 h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: mColor, background: withAlpha(mColor, 0.12) }}
                >
                  <span className="font-sora text-base font-extrabold" style={{ color: mColor }}>
                    {match.score}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="pi-pill text-[10.5px] px-2.5 py-0.5 border-transparent"
                      style={{ background: withAlpha(tcfg.color, 0.14), color: tcfg.color }}
                    >
                      <tcfg.icon className="w-3 h-3" /> {tcfg.label}
                    </span>
                    <span
                      className="pi-pill text-[10.5px] px-2.5 py-0.5 border-transparent"
                      style={{ background: withAlpha(scfg.color, 0.14), color: scfg.color }}
                    >
                      {scfg.label}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-platinum flex items-center gap-2 flex-wrap">
                    <span className="truncate">{match.propertyA.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-platinum/30 flex-shrink-0" />
                    <span className="truncate">{match.propertyB.title}</span>
                  </div>
                  <div className="text-[11px] font-mono text-platinum/35 mt-1.5">
                    S.No. {match.propertyA.survey ?? "—"} vs {match.propertyB.survey ?? "—"} · Found {match.createdAt}
                  </div>
                </div>

                <ChevronRight
                  className={`w-4 h-4 text-platinum/35 flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                />
              </div>

              {/* Expanded: comparison + factors */}
              {isExpanded && (
                <div className="pi-fade-up border-t border-white/[0.08]">
                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] border-b border-white/[0.08]">
                    <div className="p-5">
                      <div className="text-[10.5px] font-bold uppercase tracking-wider text-platinum/35 mb-2">
                        Property A
                      </div>
                      <div className="font-sora font-bold text-platinum mb-2">{match.propertyA.title}</div>
                      {(
                        [
                          ["Survey", match.propertyA.survey ?? "—"],
                          ["Owner", match.propertyA.owner ?? "—"],
                          ["Village", match.propertyA.village ?? "—"],
                          ["Area", formatArea(match.propertyA.area)],
                          ["Price", formatPrice(match.propertyA.price)],
                          ["Broker", match.propertyA.broker ?? "—"],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1 text-xs">
                          <span className="text-platinum/40">{k}</span>
                          <span className="text-platinum/80 font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="hidden sm:flex items-center justify-center px-2">
                      <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.1] text-platinum/50">
                        VS
                      </span>
                    </div>
                    <div className="p-5 border-t sm:border-t-0 sm:border-l border-white/[0.08]">
                      <div className="text-[10.5px] font-bold uppercase tracking-wider text-platinum/35 mb-2">
                        Property B
                      </div>
                      <div className="font-sora font-bold text-platinum mb-2">{match.propertyB.title}</div>
                      {(
                        [
                          ["Survey", match.propertyB.survey ?? "—"],
                          ["Owner", match.propertyB.owner ?? "—"],
                          ["Village", match.propertyB.village ?? "—"],
                          ["Area", formatArea(match.propertyB.area)],
                          ["Price", formatPrice(match.propertyB.price)],
                          ["Broker", match.propertyB.broker ?? "—"],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1 text-xs">
                          <span className="text-platinum/40">{k}</span>
                          <span className="text-platinum/80 font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Factor breakdown */}
                  <div className="p-5">
                    <div className="text-xs font-bold uppercase tracking-wider text-platinum/50 mb-3.5">
                      Match Factors
                    </div>
                    {match.factors.map((f, fi) => {
                      const fColor = factorScoreColor(f.score);
                      return (
                        <div key={fi} className="mb-3.5 last:mb-0">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-platinum/55">{f.name}</span>
                            <span className="font-mono font-bold" style={{ color: fColor }}>
                              {f.score}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{ width: `${f.score}%`, background: fColor }}
                            />
                          </div>
                          <div className="text-[11px] text-platinum/35 mt-1.5">{f.detail}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  {match.status === "pending" && (
                    <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.08] flex-wrap">
                      <div className="text-xs text-platinum/45 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        {match.type === "exact_duplicate"
                          ? "This property appears to be listed twice by different brokers"
                          : match.type === "conflict"
                            ? "Same survey number with different owners — possible ownership conflict"
                            : "Review the factors above to determine if this is a genuine match"}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resolveMatch(match.id, "dismissed");
                          }}
                          className="pi-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-platinum/65"
                        >
                          <X className="w-3.5 h-3.5" /> Dismiss
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resolveMatch(match.id, "confirmed");
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:brightness-110"
                          style={{
                            background: withAlpha(RISK_COLORS.CRITICAL, 0.12),
                            color: "#ef8a8a",
                            borderColor: withAlpha(RISK_COLORS.CRITICAL, 0.3),
                          }}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" /> Confirm Match
                        </button>
                      </div>
                    </div>
                  )}

                  {match.status !== "pending" && (
                    <div className="flex items-center gap-2 px-5 py-3 border-t border-white/[0.08] text-xs text-platinum/40">
                      {match.status === "dismissed" ? (
                        <>
                          <XCircle className="w-3.5 h-3.5" /> Dismissed by admin
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" /> Confirmed as duplicate — flagged for review
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-500/20 text-xs text-platinum/55 leading-relaxed">
        <strong className="text-amber-400 font-semibold">Important:</strong> Matches are algorithmic suggestions, not
        legal determinations. The system identifies <em>potential</em> matches for human review. It never claims
        ownership or makes legal assertions. All matches should be verified through official channels before taking
        action.
      </div>
    </div>
  );
}
