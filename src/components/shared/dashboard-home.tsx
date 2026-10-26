// src/components/shared/dashboard-home.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  Building2, CheckCircle2, AlertTriangle, Clock, Scale, Newspaper,
  GitMerge, Bell, Plus, ArrowUpRight, ArrowDownRight,
  Bot, Calendar, FileText, Shield, ChevronRight,
  BarChart3, RefreshCw,
} from "lucide-react";

// ─── Counter hook ───
function useCounter(end: number, dur = 1400) {
  const [v, setV] = useState(0);
  const ref = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!end) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setV(Math.floor((1 - Math.pow(1 - p, 3)) * end));
      if (p < 1) ref.current = requestAnimationFrame(step);
    };
    ref.current = requestAnimationFrame(step);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [end, dur]);
  return v;
}

// ─── Demo data ───

const RECENT_ALERTS = [
  { id: 1, icon: AlertTriangle, color: "#ef4444", bg: "rgba(239,68,68,0.1)", title: "Risk score HIGH — Survey 118, Hinjewadi", sub: "Score updated to 73/100. Active court case with stay order.", time: "2h ago" },
  { id: 2, icon: Shield, color: "#a855f7", bg: "rgba(168,85,247,0.1)", title: "Duplicate detected — S.No.299/12", sub: "Same survey listed by 2 brokers. Match score: 92%.", time: "5h ago" },
  { id: 3, icon: Scale, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", title: "Court hearing scheduled — WP/8657/2020", sub: "Next hearing: 22 Sep 2026 at High Court, Pune Bench.", time: "1d ago" },
  { id: 4, icon: Newspaper, color: "#06b6d4", bg: "rgba(6,182,212,0.1)", title: "News match — Mulshi land acquisition", sub: "Sakal article matched to Farm Plot, Mulshi (87% relevance).", time: "2d ago" },
];

const RECENT_ACTIVITY = [
  { action: "Verification completed", target: "Plot 42, Kharadi", user: "Vishal Sharma", time: "3h ago", icon: CheckCircle2, color: "#10b981" },
  { action: "Document uploaded", target: "Gala 3, Wagholi", user: "Amit Kumar", time: "6h ago", icon: FileText, color: "#6366f1" },
  { action: "Property listed", target: "Row House 12, Undri", user: "Nitin Kale", time: "1d ago", icon: Building2, color: "#6366f1" },
  { action: "Risk score computed", target: "Flat 7B, Baner", user: "AI Agent", time: "1d ago", icon: Bot, color: "#f59e0b" },
  { action: "Court case linked", target: "Survey 118, Hinjewadi", user: "System", time: "2d ago", icon: Scale, color: "#ef4444" },
];

const STATUS_BREAKDOWN = [
  { label: "Verified", count: 10, pct: 20, color: "#10b981" },
  { label: "Listed", count: 23, pct: 30, color: "#6366f1" },
  { label: "Under review", count: 20, pct: 20, color: "#f59e0b" },
  { label: "Flagged", count: 5, pct: 10, color: "#ef4444" },
  { label: "Draft", count: 20, pct: 20, color: "#52525b" },
];

const QUICK_ACTIONS = [
  { label: "Add property", icon: Plus, href: "/properties/new", color: "#6366f1" },
  { label: "Run scan", icon: RefreshCw, href: "/matching", color: "#10b981" },
  { label: "View analytics", icon: BarChart3, href: "/analytics", color: "#f59e0b" },
  { label: "Notifications", icon: Bell, href: "/notifications", color: "#a855f7" },
];

// ─── Component ───

export default function DashboardHome() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => { setTimeout(() => setLoading(false), 800); }, []);

  const propCount = useCounter(loading ? 0 : 147);
  const verifiedCount = useCounter(loading ? 0 : 89);
  const riskCount = useCounter(loading ? 0 : 7);
  const caseCount = useCounter(loading ? 0 : 15);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ fontFamily: "system-ui,-apple-system,sans-serif", color: "#fafafa" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .fade-up{animation:fadeUp 0.35s ease both}
        .skeleton{animation:pulse 1.8s ease-in-out infinite;background:rgba(255,255,255,0.04);border-radius:8px}
        .dcard{background:#111113;border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow:hidden;transition:border-color 0.2s}
        .dcard:hover{border-color:rgba(255,255,255,0.1)}
        .dcard-head{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center}
        .metric{background:#111113;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px;transition:all 0.2s}
        .metric:hover{border-color:rgba(255,255,255,0.1);transform:translateY(-1px)}
        .qa-btn{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#a1a1aa;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.15s;text-decoration:none}
        .qa-btn:hover{background:rgba(99,102,241,0.04);border-color:rgba(99,102,241,0.2);color:#818cf8;transform:translateY(-2px)}
        .alert-row{display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.1s;cursor:pointer}
        .alert-row:hover{background:rgba(255,255,255,0.02)}
        .alert-row:last-child{border-bottom:none}
        .act-row{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
        .act-row:last-child{border-bottom:none}
        .view-link{font-size:12px;color:#6366f1;text-decoration:none;display:flex;align-items:center;gap:4px;font-weight:500}
        .view-link:hover{text-decoration:underline}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
          {greeting}, {user?.firstName || "User"}
        </h1>
        <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
          Here&apos;s what&apos;s happening across your property portfolio today.
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total properties", value: propCount, icon: Building2, color: "#6366f1", delta: "+12 this month", up: true },
          { label: "Verified", value: verifiedCount, icon: CheckCircle2, color: "#10b981", delta: `${Math.round(89/147*100)}% verification rate`, up: true },
          { label: "High risk flagged", value: riskCount, icon: AlertTriangle, color: "#ef4444", delta: "3 new this week", up: false },
          { label: "Active court cases", value: caseCount, icon: Scale, color: "#f59e0b", delta: "2 hearings upcoming", up: null },
        ].map((m, i) => (
          <div key={i} className={`metric ${loading ? "" : "fade-up"}`} style={{ animationDelay: `${i * 0.08}s` }}>
            {loading ? (
              <><div className="skeleton" style={{ width: 80, height: 12, marginBottom: 12 }} /><div className="skeleton" style={{ width: 60, height: 28, marginBottom: 8 }} /><div className="skeleton" style={{ width: 110, height: 14 }} /></>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, color: "#71717a", fontWeight: 500 }}>{m.label}</span>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: `${m.color}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <m.icon size={17} color={m.color} />
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{m.value.toLocaleString()}</div>
                <div style={{ fontSize: 12, marginTop: 6, display: "flex", alignItems: "center", gap: 4, color: m.up === true ? "#10b981" : m.up === false ? "#ef4444" : "#71717a" }}>
                  {m.up === true && <ArrowUpRight size={14} />}{m.up === false && <ArrowDownRight size={14} />}{m.up === null && <Calendar size={13} />}
                  {m.delta}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {QUICK_ACTIONS.map((qa, i) => (
          <a key={i} href={qa.href} className="qa-btn fade-up" style={{ animationDelay: `${0.3 + i * 0.06}s` }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${qa.color}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <qa.icon size={18} color={qa.color} />
            </div>
            {qa.label}
          </a>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, marginBottom: 16 }}>
        {/* Alerts panel */}
        <div className="dcard fade-up" style={{ animationDelay: "0.4s" }}>
          <div className="dcard-head">
            <span style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color="#f59e0b" /> Recent alerts
            </span>
            <a href="/notifications" className="view-link">View all <ChevronRight size={14} /></a>
          </div>
          {RECENT_ALERTS.map((alert) => (
            <div key={alert.id} className="alert-row">
              <div style={{ width: 36, height: 36, borderRadius: 10, background: alert.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <alert.icon size={16} color={alert.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{alert.title}</div>
                <div style={{ fontSize: 12, color: "#71717a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.sub}</div>
              </div>
              <div style={{ fontSize: 11, color: "#52525b", whiteSpace: "nowrap", flexShrink: 0 }}>{alert.time}</div>
            </div>
          ))}
        </div>

        {/* Property status breakdown */}
        <div className="dcard fade-up" style={{ animationDelay: "0.5s" }}>
          <div className="dcard-head">
            <span style={{ fontWeight: 600, fontSize: 15 }}>Property status</span>
            <Link href="/properties" className="view-link">View all <ChevronRight size={14} /></Link>
          </div>
          <div style={{ padding: 20 }}>
            {/* Stacked bar */}
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 20 }}>
              {STATUS_BREAKDOWN.map((s, i) => (
                <div key={i} style={{ width: `${s.pct}%`, background: s.color, transition: "width 0.5s" }} title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            {STATUS_BREAKDOWN.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < STATUS_BREAKDOWN.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                  <span style={{ fontSize: 13, color: "#a1a1aa" }}>{s.label}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="dcard fade-up" style={{ animationDelay: "0.6s" }}>
        <div className="dcard-head">
          <span style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} color="#6366f1" /> Recent activity
          </span>
        </div>
        <div style={{ padding: "8px 20px" }}>
          {RECENT_ACTIVITY.map((act, i) => (
            <div key={i} className="act-row">
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: act.color, flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{act.action}</span>
                  <span style={{ color: "#71717a" }}> — </span>
                  <span style={{ color: "#a1a1aa" }}>{act.target}</span>
                </div>
                <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{act.user} · {act.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
