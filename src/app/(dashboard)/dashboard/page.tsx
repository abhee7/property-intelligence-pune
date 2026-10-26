"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { StatCard } from "@/components/ui/stat-card";
import { RiskBadge } from "@/components/ui/risk-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Building2,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Scale,
  Plus,
  ArrowRight,
  MapPin,
  TrendingUp,
  FileCheck,
  Newspaper,
  Loader2,
  Eye,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Sector,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import {
  RISK_COLORS,
  STATUS_COLORS,
  CHART_SERIES,
  CHART_STATUS,
  CHART_INK,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
} from "@/lib/chart-theme";

function renderActivePieShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 7} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 13} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.32} />
    </g>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeRiskSlice, setActiveRiskSlice] = useState<number | undefined>(undefined);
  const [hoverStatusBar, setHoverStatusBar] = useState<number | null>(null);
  const [hoverTalukaBar, setHoverTalukaBar] = useState<number | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const token = getAccessToken();
        const res = await fetch("/api/dashboard", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const result = await res.json();
        if (result.success && result.data) {
          setData(result.data);
        }
      } catch (err) {
        console.error("Dashboard data fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [getAccessToken]);

  // Everything below comes from /api/dashboard. While it loads (or if it fails) the charts are empty
  // rather than showing invented numbers.
  const kpis = data?.kpis ?? { totalProperties: 0, verifiedProperties: 0, underVerificationCount: 0, highRiskCount: 0, activeCases: 0, verificationRate: 0 };
  const statusData: { status: string; count: number }[] = data?.statusBreakdown ?? [];
  const riskData: { name: string; value: number; key: string }[] = data?.riskDistribution ?? [];
  const talukaData: { taluka: string; count: number }[] = data?.talukaBreakdown ?? [];
  const trendData: { month: string; properties: number; documentsRead: number }[] = data?.trend ?? [];
  const highRiskProperties: any[] = data?.highRiskProperties ?? [];
  const riskTotal = riskData.reduce((sum, r) => sum + r.value, 0);

  const timeAgo = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${Math.max(mins, 1)} min ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
    if (mins < 60 * 24 * 60) return `${Math.round(mins / (60 * 24))} d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  const recentActivity: { type: string; title: string; time: string; desc: string }[] = (data?.recentActivity ?? []).map((a: any) => ({
    type: a.type, title: a.title, desc: a.desc, time: timeAgo(a.at),
  }));

  const activityIconStyles: Record<string, string> = {
    PROPERTY: "text-[#7fb0ee]",
    RISK: "text-rose-400",
    COURT: "text-violet-400",
    NEWS: "text-amber-400",
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="pi-card flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/[0.04] rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.12] text-platinum/70 text-xs font-bold uppercase tracking-wider mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Pune &amp; Maharashtra Intelligence Zone
          </div>
          <h1 className="font-sora text-2xl md:text-3xl font-extrabold text-platinum tracking-tight">
            Property Due-Diligence Overview
          </h1>
          <p className="text-sm text-platinum/45 max-w-xl">
            Welcome back, <span className="text-platinum font-semibold">{user?.firstName}</span>. Real-time AI risk assessment, title verification, court case tracking, and news intelligence.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/properties/new"
            className="pi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sora font-bold text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" />
            Add Property
          </Link>
          <Link
            href="/risk-analysis"
            className="pi-btn-ghost inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-platinum/80 font-bold text-xs uppercase tracking-wider"
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Risk Audit
          </Link>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Properties"
          value={kpis.totalProperties}
          icon={<Building2 className="w-5 h-5 text-[#7fb0ee]" />}
          subtitle="Managed in Pune region"
          badgeText="Active"
          badgeVariant="brand"
        />
        <StatCard
          title="Verified Properties"
          value={kpis.verifiedProperties}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          subtitle={`${kpis.verificationRate ?? 0}% verification rate`}
          badgeText="Verified"
          badgeVariant="success"
        />
        <StatCard
          title="Under Verification"
          value={kpis.underVerificationCount ?? 0}
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          subtitle="Properties awaiting verification"
          badgeText="Pending"
          badgeVariant="warning"
        />
        <StatCard
          title="High-Risk Properties"
          value={kpis.highRiskCount}
          icon={<ShieldAlert className="w-5 h-5 text-rose-400" />}
          subtitle="Title or ownership issue"
          badgeText="Action Req."
          badgeVariant="error"
        />
        <StatCard
          title="Active Court Cases"
          value={kpis.activeCases}
          icon={<Scale className="w-5 h-5 text-violet-400" />}
          subtitle="Litigations linked"
          badgeText="Legal Alert"
          badgeVariant="brand"
        />
      </div>

      {/* Main Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth & Verification Line Chart */}
        <div className="pi-card lg:col-span-2 p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-sora text-base font-bold text-platinum">
                Property Onboarding &amp; Document Reading Trend
              </h3>
              <p className="text-xs text-platinum/40">
                Cumulative properties on file and documents read by OCR, last 6 months
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-[#7fb0ee]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_SERIES[0] }} />
                Properties
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_STATUS.good }} />
                Documents read
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
                <XAxis dataKey="month" stroke={CHART_INK.muted} fontSize={12} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                <YAxis stroke={CHART_INK.muted} fontSize={12} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  cursor={{ stroke: CHART_INK.axis }}
                />
                <Line
                  type="monotone"
                  dataKey="properties"
                  stroke={CHART_SERIES[0]}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: CHART_SERIES[0], strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="documentsRead"
                  stroke={CHART_STATUS.good}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: CHART_STATUS.good, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Level Donut Chart */}
        <div className="pi-card p-6 flex flex-col justify-between">
          <div className="mb-2">
            <h3 className="font-sora text-base font-bold text-platinum">
              Portfolio Risk Distribution
            </h3>
            <p className="text-xs text-platinum/40">
              Categorized by AI property risk scoring model
            </p>
          </div>

          <div className="h-52 w-full flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                  activeIndex={activeRiskSlice}
                  activeShape={renderActivePieShape}
                  onMouseEnter={(_, index) => setActiveRiskSlice(index)}
                  onMouseLeave={() => setActiveRiskSlice(undefined)}
                  style={{ cursor: "pointer" }}
                >
                  {riskData.map((entry) => (
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
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-sora text-2xl font-extrabold text-platinum tabular-nums">
                {activeRiskSlice !== undefined ? riskData[activeRiskSlice].value : riskTotal}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-platinum/40 mt-0.5">
                {activeRiskSlice !== undefined ? riskData[activeRiskSlice].name : "Total"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 pt-2 border-t border-white/[0.08]">
            {riskData.map((r) => (
              <div key={r.key} className="text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-platinum/40 block">
                  {r.name}
                </span>
                <span className="font-sora text-sm font-extrabold text-platinum">
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary Bar Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution Bar Chart */}
        <div className="pi-card p-6">
          <h3 className="font-sora text-base font-bold text-platinum mb-1">
            Property Status Breakdown
          </h3>
          <p className="text-xs text-platinum/40 mb-4">
            Live counts across verification pipelines
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
                <XAxis dataKey="status" stroke={CHART_INK.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                <YAxis stroke={CHART_INK.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  onMouseEnter={(_, index) => setHoverStatusBar(index)}
                  onMouseLeave={() => setHoverStatusBar(null)}
                  style={{ cursor: "pointer" }}
                >
                  {statusData.map((entry: any, index: number) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLORS[entry.status] || CHART_SERIES[0]}
                      fillOpacity={hoverStatusBar === null || hoverStatusBar === index ? 1 : 0.4}
                      style={{ transition: "fill-opacity 160ms ease" }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Properties by Taluka Location */}
        <div className="pi-card p-6">
          <h3 className="font-sora text-base font-bold text-platinum mb-1">
            Top Locations / Talukas
          </h3>
          <p className="text-xs text-platinum/40 mb-4">
            Property density across Pune district talukas
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={talukaData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} horizontal={false} />
                <XAxis type="number" stroke={CHART_INK.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                <YAxis dataKey="taluka" type="category" stroke={CHART_INK.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar
                  dataKey="count"
                  radius={[0, 6, 6, 0]}
                  onMouseEnter={(_, index) => setHoverTalukaBar(index)}
                  onMouseLeave={() => setHoverTalukaBar(null)}
                  style={{ cursor: "pointer" }}
                >
                  {talukaData.map((entry, index) => (
                    <Cell
                      key={entry.taluka}
                      fill={CHART_SERIES[0]}
                      fillOpacity={hoverTalukaBar === null || hoverTalukaBar === index ? 1 : 0.4}
                      style={{ transition: "fill-opacity 160ms ease" }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Prominent High-Risk Properties Table & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* High Risk Properties Section */}
        <div className="pi-card lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                High-Risk Watchlist Properties
              </h3>
              <p className="text-xs text-platinum/40">
                Properties with pending litigation, title overlaps, or high risk scores
              </p>
            </div>
            <Link
              href="/risk-analysis"
              className="text-xs font-bold text-platinum/60 hover:text-platinum transition-colors flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="pi-table w-full text-left text-xs">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Survey #</th>
                  <th>Risk Level</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {highRiskProperties.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-platinum/40 py-6 text-center">
                      {loading ? "Loading…" : "No scored properties yet."}
                    </td>
                  </tr>
                )}
                {highRiskProperties.map((prop: any) => (
                  <tr key={prop.id}>
                    <td className="font-semibold text-platinum">
                      {prop.title}
                    </td>
                    <td className="text-platinum/50">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-platinum/35" />
                        {prop.location || prop.metadata?.village || "Pune"}
                      </span>
                    </td>
                    <td className="font-mono text-platinum/55">
                      {prop.surveyNumber || "—"}
                    </td>
                    <td>
                      <RiskBadge
                        level={prop.riskLevel || "HIGH"}
                        score={prop.riskScore}
                        size="sm"
                      />
                    </td>
                    <td>
                      <StatusBadge status={prop.status} size="sm" />
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/properties/${prop.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-platinum/75 hover:text-platinum font-bold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Intelligence Activity */}
        <div className="pi-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-sora text-base font-bold text-platinum mb-1">
              Recent Intelligence Stream
            </h3>
            <p className="text-xs text-platinum/40 mb-4">
              Latest risk scores, documents read, court cases and news
            </p>

            <div className="space-y-4">
              {recentActivity.length === 0 && <p className="text-xs text-platinum/40">{loading ? "Loading…" : "No recent activity."}</p>}
              {recentActivity.map((act, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <div className={`pi-icon-tile w-7 h-7 flex-shrink-0 mt-0.5 ${activityIconStyles[act.type]}`}>
                    {act.type === "PROPERTY" && <Building2 className="w-3.5 h-3.5" />}
                    {act.type === "RISK" && <ShieldAlert className="w-3.5 h-3.5" />}
                    {act.type === "COURT" && <Scale className="w-3.5 h-3.5" />}
                    {act.type === "NEWS" && <Newspaper className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-platinum truncate">
                        {act.title}
                      </span>
                      <span className="text-[10px] text-platinum/35">{act.time}</span>
                    </div>
                    <p className="text-platinum/45 truncate mt-0.5">
                      {act.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08]">
            <Link
              href="/properties"
              className="pi-btn-ghost w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-platinum"
            >
              Explore All Properties
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
