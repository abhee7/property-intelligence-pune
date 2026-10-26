"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart3, TrendingUp, ShieldCheck, Scale, FileText, Download, Loader2, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid, Cell, Legend } from "recharts";
import {
  CHART_SERIES,
  CHART_STATUS,
  CHART_INK,
  RISK_COLORS,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
} from "@/lib/chart-theme";
import type { AnalyticsDashboard } from "@/modules/analytics/analytics.service";

const crore = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

const tooltipProps = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_TOOLTIP_LABEL_STYLE,
  itemStyle: CHART_TOOLTIP_ITEM_STYLE,
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="pi-card p-6 space-y-4">
      <div>
        <h3 className="font-sora text-base font-bold text-platinum">{title}</h3>
        {subtitle && <p className="text-xs text-platinum/45">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function AnalyticsReportsPage() {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAccessToken]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics", { headers: authHeaders() });
        const json = await res.json();
        if (json.success) setData(json.data.dashboard);
        else setError(json.error || "Couldn't load analytics");
      } catch (err: any) {
        setError(err.message || "Couldn't load analytics");
      }
    })();
  }, [authHeaders]);

  async function exportCsv() {
    const res = await fetch("/api/analytics?export=csv", { headers: authHeaders() });
    if (!res.ok) return setError("Export failed");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `propintel-properties-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const k = data?.kpis;
  const axis = { stroke: CHART_INK.muted, fontSize: 12, tickLine: false as const, axisLine: { stroke: CHART_INK.axis } };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight flex items-center gap-2.5">
            <span className="pi-icon-tile w-9 h-9 text-platinum/80">
              <BarChart3 className="w-5 h-5" />
            </span>
            Portfolio Analytics
          </h1>
          <p className="text-xs text-platinum/45 mt-1">Computed live from your properties, documents, court cases and matches</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data}
          className="pi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sora font-bold text-xs disabled:opacity-60"
        >
          <Download className="w-3.5 h-3.5" /> Export properties (CSV)
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-500/[0.07] border border-rose-500/25 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {!data && !error && (
        <div className="pi-card p-10 text-center text-xs text-platinum/45">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Computing analytics…
        </div>
      )}

      {data && k && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Properties"
              value={k.properties.total.toLocaleString("en-IN")}
              icon={<TrendingUp className="w-5 h-5 text-violet-400" />}
              subtitle={`${crore(k.portfolioValue)} total listed value`}
              badgeText={`Avg risk ${k.avgRiskScore}`}
              badgeVariant="brand"
            />
            <StatCard
              title="Verified"
              value={`${k.verified.rate}%`}
              icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
              subtitle={`${k.verified.total} of ${k.properties.total} properties`}
              badgeText="Documents verified"
              badgeVariant="success"
            />
            <StatCard
              title="High / Critical risk"
              value={k.highRisk.total}
              icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
              subtitle={`${k.highRisk.rate}% of the portfolio · ${k.openMatches} matches awaiting review`}
              badgeText="Action needed"
              badgeVariant="error"
            />
            <StatCard
              title="Active court cases"
              value={k.activeCases}
              icon={<Scale className="w-5 h-5 text-amber-400" />}
              subtitle={`${k.stayOrders} with a stay order in force`}
              badgeText="Litigation"
              badgeVariant="warning"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Risk distribution" subtitle="Properties by risk level">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.riskDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="value" name="Properties" radius={[6, 6, 0, 0]}>
                      {data.riskDistribution.map((d) => (
                        <Cell key={d.label} fill={RISK_COLORS[d.label] || CHART_SERIES[0]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Listings added per month" subtitle="By creation date, with how many are flagged">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthlyListings}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
                    <XAxis dataKey="month" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tooltipProps} />
                    <Area type="monotone" dataKey="added" name="Added" stroke={CHART_SERIES[0]} fill={CHART_SERIES[0]} fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="flagged" name="Flagged" stroke={CHART_STATUS.critical} fill={CHART_STATUS.critical} fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Busiest localities" subtitle="Property count, and how many score High or Critical">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topLocalities} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} horizontal={false} />
                    <XAxis type="number" {...axis} />
                    <YAxis type="category" dataKey="name" width={110} {...axis} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="properties" name="Properties" fill={CHART_SERIES[0]} radius={[0, 6, 6, 0]} />
                    <Bar dataKey="highRisk" name="High / Critical" fill={CHART_STATUS.critical} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Litigation by case type" subtitle="Cases linked to properties">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.litigationByType} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} horizontal={false} />
                    <XAxis type="number" {...axis} />
                    <YAxis type="category" dataKey="type" width={130} {...axis} />
                    <Tooltip {...tooltipProps} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="active" name="Active" stackId="a" fill={CHART_STATUS.critical} />
                    <Bar dataKey="disposed" name="Disposed" stackId="a" fill={CHART_INK.muted} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Price distribution" subtitle="Listed price">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.priceRanges}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="value" name="Properties" fill={CHART_SERIES[1] ?? CHART_SERIES[0]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Document pipeline" subtitle="Every uploaded document, read by OCR">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label: "Documents", value: k.documents.total, color: "text-platinum" },
                  { label: "Read cleanly", value: k.documents.completed, color: "text-emerald-400" },
                  { label: "Need review", value: k.documents.needsReview, color: "text-amber-400" },
                  { label: "Failed", value: k.documents.failed, color: "text-rose-400" },
                  { label: "Avg OCR confidence", value: `${k.documents.avgConfidence}%`, color: "text-platinum" },
                  { label: "Avg scan time", value: `${k.documents.avgSeconds}s`, color: "text-platinum" },
                ].map((s) => (
                  <div key={s.label} className="pi-surface p-3">
                    <div className="text-platinum/45 font-semibold">{s.label}</div>
                    <div className={`font-sora text-xl font-extrabold mt-1 ${s.color}`}>{s.value}</div>
                  </div>
                ))}
              </div>
              {k.documents.total === 0 && (
                <p className="text-xs text-platinum/45 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> No documents yet — upload some on the Document Verification page.
                </p>
              )}
            </Card>

            <Card title="Brokers" subtitle="Most listings, with verified and high-risk counts">
              <table className="pi-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Broker</th>
                    <th className="text-right">Listings</th>
                    <th className="text-right">Verified</th>
                    <th className="text-right">High risk</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topBrokers.map((b) => (
                    <tr key={b.name}>
                      <td className="font-bold text-platinum">{b.name}</td>
                      <td className="text-right font-mono">{b.properties}</td>
                      <td className="text-right font-mono text-emerald-400">{b.verified}</td>
                      <td className="text-right font-mono text-rose-400">{b.highRisk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
