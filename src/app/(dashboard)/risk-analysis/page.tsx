"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import { StatCard } from "@/components/ui/stat-card";
import { RiskBadge } from "@/components/ui/risk-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  FileSearch,
  CheckCircle2,
  TrendingDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import {
  RISK_COLORS,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
} from "@/lib/chart-theme";

export default function RiskAnalysisPage() {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("All");

  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRiskData = useCallback(async () => {
    try {
      const token = getAccessToken();
      const res = await fetch("/api/risk-analysis", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const result = await res.json();
      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || "Couldn't load risk data");
      }
    } catch (err: any) {
      console.error("Risk analysis fetch error:", err);
      setError(err.message || "Couldn't load risk data");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchRiskData();
  }, [fetchRiskData]);

  async function recomputeAll() {
    setRecomputing(true);
    try {
      const token = getAccessToken();
      const res = await fetch("/api/risk-analysis", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Recalculation failed");
      await fetchRiskData();
    } catch (err: any) {
      setError(err.message || "Recalculation failed");
    } finally {
      setRecomputing(false);
    }
  }

  const riskScores: any[] = data?.riskScores || [];
  const dist: Record<string, number> = data?.distribution || {};
  const total = riskScores.length;

  const distributionData = [
    { name: "Minimal", value: dist.MINIMAL || 0, key: "MINIMAL" },
    { name: "Low", value: dist.LOW || 0, key: "LOW" },
    { name: "Moderate", value: dist.MODERATE || 0, key: "MODERATE" },
    { name: "High", value: dist.HIGH || 0, key: "HIGH" },
    { name: "Critical", value: dist.CRITICAL || 0, key: "CRITICAL" },
  ];

  // One card per factor definition: its weight and how many properties score badly on it (56+ = HIGH)
  const riskFactors: { name: string; category: string; weight: number; activeCases: number }[] = (data?.riskFactors || []).map((def: any) => ({
    name: def.name,
    category: def.category,
    weight: def.defaultWeight,
    activeCases: riskScores.filter((r: any) => (r.factors || []).some((f: any) => f.factorDef?.id === def.id && f.factorScore >= 56)).length,
  }));

  const cleanRate = total ? Math.round((((dist.MINIMAL || 0) + (dist.LOW || 0)) / total) * 100) : 0;

  const filteredScores = riskScores.filter((r: any) => {
    if (search && !r.property?.title?.toLowerCase().includes(search.toLowerCase()) && !r.property?.surveyNumber?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (levelFilter !== "All" && r.riskLevel !== levelFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
            AI Risk Intelligence Portal
          </h1>
          <p className="text-xs text-platinum/45">
            Portfolio risk exposure, automated title audit, and high-risk property watchlist
          </p>
        </div>
        <button
          onClick={recomputeAll}
          disabled={recomputing}
          className="pi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sora font-bold text-xs disabled:opacity-60"
        >
          {recomputing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {recomputing ? "Recalculating…" : "Recalculate all"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-500/[0.07] border border-rose-500/25 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="High Risk Count"
          value={data?.highRiskCount ?? 0}
          icon={<ShieldX className="w-5 h-5 text-rose-400" />}
          subtitle="Critical or High Risk properties"
          badgeText="Action Needed"
          badgeVariant="error"
        />
        <StatCard
          title="Moderate Risk Count"
          value={dist.MODERATE || 0}
          icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
          subtitle="Requires revenue verification"
          badgeText="Review"
          badgeVariant="warning"
        />
        <StatCard
          title="Minimal/Low Risk Rate"
          value={`${cleanRate}%`}
          icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
          subtitle="Share of properties scoring Minimal or Low"
          badgeText="Clean"
          badgeVariant="success"
        />
        <StatCard
          title="Scored Factors"
          value={`${riskFactors.length} factors`}
          icon={<FileSearch className="w-5 h-5 text-[#7fb0ee]" />}
          subtitle="Title, legal, documents, ownership, news"
          badgeText="Rule-based"
          badgeVariant="brand"
        />
      </div>

      {/* Risk Distribution Visuals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut Chart */}
        <div className="pi-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-sora text-base font-bold text-platinum mb-1">
              Portfolio Risk Breakdown
            </h3>
            <p className="text-xs text-platinum/40 mb-4">
              Distribution across 5 risk severity levels
            </p>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {distributionData.map((entry) => (
                    <Cell key={entry.key} fill={RISK_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.08] text-xs">
            {distributionData.map((d) => (
              <div key={d.key} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-platinum/60">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RISK_COLORS[d.key] }} />
                  {d.name}
                </span>
                <span className="font-sora font-extrabold text-platinum">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Factor Weights */}
        <div className="pi-card lg:col-span-2 p-6 space-y-4">
          <h3 className="font-sora text-base font-bold text-platinum">
            Risk Factor Weights &amp; Properties Affected
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {riskFactors.map((rf, idx) => (
              <div key={idx} className="pi-surface pi-surface-hover p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-platinum">{rf.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/[0.08] text-platinum/75 border border-white/[0.14]">
                    Weight: {(rf.weight * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between text-xs text-platinum/45">
                  <span>Category: <span className="capitalize">{rf.category}</span></span>
                  <span className="font-semibold text-rose-400">{rf.activeCases} scoring High+</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filterable Risk Score Directory Table */}
      <div className="pi-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <h3 className="font-sora text-base font-bold text-platinum">
            Property Risk Audits &amp; Narrative Logs
          </h3>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="pi-input relative flex-1 sm:w-64 flex items-center rounded-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-platinum/35 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search risk records..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
              />
            </div>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="pi-input rounded-xl px-3 py-2 text-xs bg-transparent text-platinum focus:outline-none"
            >
              <option value="All" className="bg-[#14151b]">All Risk Levels</option>
              <option value="MINIMAL" className="bg-[#14151b]">Minimal</option>
              <option value="LOW" className="bg-[#14151b]">Low</option>
              <option value="MODERATE" className="bg-[#14151b]">Moderate</option>
              <option value="HIGH" className="bg-[#14151b]">High</option>
              <option value="CRITICAL" className="bg-[#14151b]">Critical</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="pi-table w-full text-left text-xs">
            <thead>
              <tr>
                <th>Property Title</th>
                <th>Survey #</th>
                <th>Risk Level</th>
                <th>AI Narrative Excerpt</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="text-center text-platinum/45 py-8">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading risk data…
                  </td>
                </tr>
              )}
              {!loading && filteredScores.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-platinum/45 py-8">
                    {total === 0 ? "No risk scores yet — press “Recalculate all” to score every property." : "No records match your filters."}
                  </td>
                </tr>
              )}
              {filteredScores.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-bold text-platinum">
                    {r.property?.title}
                  </td>
                  <td className="font-mono text-platinum/50">
                    {r.property?.surveyNumber || "N/A"}
                  </td>
                  <td>
                    <RiskBadge level={r.riskLevel} score={r.overallScore} size="sm" />
                  </td>
                  <td className="text-platinum/55 max-w-md truncate">
                    {r.aiNarrative || "—"}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/properties/${r.property?.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-platinum/75 hover:text-platinum font-bold transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
