// src/components/admin/admin-panel.tsx
"use client";

import { useState } from "react";
import {
  Users, Shield, Activity, Server, Database, Cpu, HardDrive, AlertTriangle,
  CheckCircle2, XCircle, Clock, Search, Plus, MoreHorizontal, ChevronDown,
  Bot, RefreshCw, Eye, Zap, FileText, Bell, Lock, Unlock, Settings, Loader2,
} from "lucide-react";
import { CHART_SERIES, CHART_STATUS } from "@/lib/chart-theme";

// ─── Demo data ───

const DEMO_USERS = [
  { id: "u1", email: "admin@sahyadri-demo.com", firstName: "System", lastName: "Admin", role: "admin", roleDisplay: "Platform admin", isActive: true, lastLogin: "1 hour ago" },
  { id: "u2", email: "manager@sahyadri-demo.com", firstName: "Prashant", lastName: "Kulkarni", role: "agency_admin", roleDisplay: "Agency admin", isActive: true, lastLogin: "3 hours ago" },
  { id: "u3", email: "vinoddeshmukh@gmail.com", firstName: "Vinod", lastName: "Deshmukh", role: "broker", roleDisplay: "Broker", isActive: true, lastLogin: "5 hours ago" },
  { id: "u4", email: "rahul_joshi@hotmail.com", firstName: "Rahul", lastName: "Joshi", role: "broker", roleDisplay: "Broker", isActive: true, lastLogin: "1 day ago" },
  { id: "u5", email: "sachin_bhosale64@hotmail.com", firstName: "Sachin", lastName: "Bhosale", role: "broker", roleDisplay: "Broker", isActive: false, lastLogin: "30 days ago" },
  { id: "u6", email: "pramod.lokhande95@hotmail.com", firstName: "Pramod", lastName: "Lokhande", role: "land_owner", roleDisplay: "Land owner", isActive: true, lastLogin: "2 days ago" },
  { id: "u7", email: "meena_kulkarni@yahoo.co.in", firstName: "Meena", lastName: "Kulkarni", role: "land_owner", roleDisplay: "Land owner", isActive: true, lastLogin: "1 week ago" },
];

const PROVIDERS = [
  { name: "OCR engine", provider: "Tesseract.js", type: "mock", status: "healthy", latency: "3.2s" },
  { name: "Gov records", provider: "Local JSON", type: "mock", status: "healthy", latency: "0.6s" },
  { name: "Court records", provider: "Local JSON", type: "mock", status: "degraded", latency: "1.2s" },
  { name: "News provider", provider: "Local JSON", type: "mock", status: "healthy", latency: "0.4s" },
  { name: "AI agents", provider: "Rule engine", type: "mock", status: "healthy", latency: "2.1s" },
  { name: "Notifications", provider: "Console log", type: "mock", status: "healthy", latency: "0.1s" },
  { name: "Risk engine", provider: "Local scorer", type: "mock", status: "healthy", latency: "1.8s" },
  { name: "Storage", provider: "Local disk", type: "mock", status: "healthy", latency: "0.02s" },
];

const ERROR_LOG = [
  { time: "2 hours ago", service: "Court scanner", level: "error", message: "eCourts API timeout after 10s — circuit breaker opened. Fallback: scoring without court data." },
  { time: "6 hours ago", service: "OCR processor", level: "warn", message: "Low confidence (0.52) on encumbrance_cert.pdf — document flagged for manual review." },
  { time: "1 day ago", service: "Matching engine", level: "info", message: "Full scan completed — 100 properties, 4,950 comparisons, 4 matches found in 2.3s." },
  { time: "2 days ago", service: "News monitor", level: "warn", message: "RSS feed unreachable — Pudhari. Retrying in 60 minutes." },
  { time: "3 days ago", service: "Risk engine", level: "info", message: "Batch re-computation completed for 80 properties. 3 score changes > 10 points." },
  { time: "5 days ago", service: "Notification", level: "info", message: "Dispatched 12 alerts (4 WhatsApp, 5 email, 3 in-app) for risk threshold breach." },
];

const AUDIT_LOG = [
  { time: "1 hour ago", user: "System Admin", action: "Login", resource: "auth", ip: "127.0.0.1" },
  { time: "3 hours ago", user: "Prashant Kulkarni", action: "Updated property status", resource: "prop-002", ip: "192.168.1.45" },
  { time: "5 hours ago", user: "Vinod Deshmukh", action: "Uploaded 3 documents", resource: "prop-001", ip: "192.168.1.67" },
  { time: "1 day ago", user: "System", action: "AI verification triggered", resource: "prop-002", ip: "internal" },
  { time: "2 days ago", user: "System Admin", action: "Deactivated user", resource: "user-broker-005", ip: "127.0.0.1" },
  { time: "3 days ago", user: "Rahul Joshi", action: "Created property", resource: "prop-009", ip: "192.168.1.89" },
];

// ─── Component ───

type AdminTab = "users" | "health" | "logs" | "audit";

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin: { bg: "rgba(244,246,250,0.12)", color: "#F4F6FA" },
  agency_admin: { bg: `${CHART_SERIES[6]}1f`, color: CHART_SERIES[6] },
  broker: { bg: `${CHART_SERIES[0]}1f`, color: CHART_SERIES[0] },
  land_owner: { bg: `${CHART_STATUS.good}1f`, color: CHART_STATUS.good },
};

const LOG_COLORS: Record<string, string> = { error: CHART_STATUS.critical, warn: CHART_STATUS.warning, info: CHART_SERIES[0] };

export default function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>("users");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState(DEMO_USERS);

  function toggleActive(id: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u));
  }

  const filteredUsers = userSearch
    ? users.filter(u => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  const tabs: { key: AdminTab; label: string; icon: any }[] = [
    { key: "users", label: "Users", icon: Users },
    { key: "health", label: "System health", icon: Activity },
    { key: "logs", label: "AI logs", icon: Bot },
    { key: "audit", label: "Audit trail", icon: Shield },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: "#F4F6FA" }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .fade-in{animation:fadeIn 0.25s ease both}
        .card{background:rgba(20,21,27,0.62);backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(255,255,255,0.09);border-radius:18px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 50px -28px rgba(0,0,0,0.75)}
        .card-head{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center}
        .card-head span{font-family:'Sora',sans-serif}
        .tab-bar{display:flex;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:20px}
        .tab{display:flex;align-items:center;gap:6px;padding:12px 20px;font-size:13px;cursor:pointer;border-bottom:2px solid transparent;color:rgba(244,246,250,0.45);transition:all 0.15s;font-weight:600}
        .tab:hover{color:rgba(244,246,250,0.75)}
        .tab.active{color:#F4F6FA;border-bottom-color:#F4F6FA}
        .tbl{width:100%;border-collapse:separate;border-spacing:0}
        .tbl th{text-align:left;padding:10px 16px;font-size:10.5px;font-weight:700;color:rgba(244,246,250,0.4);border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase;letter-spacing:0.06em}
        .tbl td{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px}
        .tbl tbody tr:hover{background:rgba(255,255,255,0.03)}
        .tbl tbody tr:last-child td{border-bottom:none}
        .pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
        .search-input{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:9px 12px 9px 36px;font-size:13px;color:#F4F6FA;outline:none;width:100%;box-sizing:border-box}
        .search-input:focus{border-color:rgba(244,246,250,0.4);box-shadow:0 0 0 3px rgba(244,246,250,0.1)}
        .search-input::placeholder{color:rgba(244,246,250,0.3)}
        .btn-sm{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:rgba(244,246,250,0.6);transition:all 0.15s;display:inline-flex;align-items:center;gap:4px}
        .btn-sm:hover{background:rgba(255,255,255,0.07);color:#F4F6FA;border-color:rgba(255,255,255,0.2)}
        .btn-primary-sm{background:linear-gradient(135deg,#ffffff,#c7ccd6);color:#0c0d11;border-color:transparent;box-shadow:0 6px 18px -6px rgba(255,255,255,0.35)}
        .health-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px", fontFamily: "'Sora',sans-serif", letterSpacing: "-0.02em" }}>Admin panel</h1>
      <p style={{ fontSize: 13, color: "rgba(244,246,250,0.45)", margin: "0 0 20px" }}>Manage users, monitor system health, and review activity</p>

      <div className="tab-bar">
        {tabs.map(t => (
          <div key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </div>
        ))}
      </div>

      {/* ─── Users ─── */}
      {tab === "users" && (
        <div className="card fade-in">
          <div className="card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 700 }}>Users ({users.length})</span>
              <div style={{ position: "relative", width: 240 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: 10, color: "rgba(244,246,250,0.4)" }} />
                <input className="search-input" placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              </div>
            </div>
            <button className="btn-sm btn-primary-sm"><Plus size={13} /> Add user</button>
          </div>
          <table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredUsers.map(u => {
                const rc = ROLE_COLORS[u.role] || ROLE_COLORS.broker;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#ffffff,#c7ccd6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#0c0d11" }}>
                          {u.firstName[0]}{u.lastName[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.firstName} {u.lastName}</div>
                          <div style={{ fontSize: 11, color: "rgba(244,246,250,0.4)" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="pill" style={{ background: rc.bg, color: rc.color }}>{u.roleDisplay}</span></td>
                    <td>
                      <span className="pill" style={{ background: u.isActive ? `${CHART_STATUS.good}1f` : `${CHART_STATUS.critical}1f`, color: u.isActive ? CHART_STATUS.good : CHART_STATUS.critical }}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ color: "rgba(244,246,250,0.4)" }}>{u.lastLogin}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn-sm" onClick={() => toggleActive(u.id)} title={u.isActive ? "Deactivate" : "Activate"}>
                          {u.isActive ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>
                        <button className="btn-sm"><MoreHorizontal size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── System health ─── */}
      {tab === "health" && (
        <div className="fade-in">
          {/* Status cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "System", value: "Healthy", icon: Server, color: CHART_STATUS.good },
              { label: "Database", value: "Connected (3ms)", icon: Database, color: CHART_STATUS.good },
              { label: "Memory", value: "124 MB / 512 MB", icon: Cpu, color: CHART_SERIES[0] },
              { label: "Uptime", value: "14d 6h 32m", icon: Clock, color: CHART_STATUS.warning },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: 16, textAlign: "center" }}>
                <s.icon size={20} color={s.color} style={{ margin: "0 auto 8px", display: "block" }} />
                <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "rgba(244,246,250,0.45)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Provider status */}
          <div className="card">
            <div className="card-head">
              <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Zap size={15} color="#F4F6FA" /> Provider status</span>
              <span className="pill" style={{ background: "rgba(244,246,250,0.08)", color: "rgba(244,246,250,0.6)" }}>All providers in mock mode</span>
            </div>
            <table className="tbl">
              <thead><tr><th>Service</th><th>Provider</th><th>Type</th><th>Status</th><th>Latency</th></tr></thead>
              <tbody>
                {PROVIDERS.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ color: "rgba(244,246,250,0.55)" }}>{p.provider}</td>
                    <td><span className="pill" style={{ background: "rgba(244,246,250,0.08)", color: "rgba(244,246,250,0.55)" }}>{p.type}</span></td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span className="health-dot" style={{ background: p.status === "healthy" ? CHART_STATUS.good : CHART_STATUS.warning }} />
                        {p.status}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums", color: "rgba(244,246,250,0.45)" }}>{p.latency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── AI logs ─── */}
      {tab === "logs" && (
        <div className="card fade-in">
          <div className="card-head">
            <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Bot size={15} color="#F4F6FA" /> Agent activity log</span>
          </div>
          {ERROR_LOG.map((log, i) => (
            <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: LOG_COLORS[log.level], flexShrink: 0, marginTop: 7 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{log.service}</span>
                  <span className="pill" style={{ background: `${LOG_COLORS[log.level]}1f`, color: LOG_COLORS[log.level] }}>{log.level}</span>
                  <span style={{ fontSize: 11, color: "rgba(244,246,250,0.35)", marginLeft: "auto" }}>{log.time}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(244,246,250,0.55)", lineHeight: 1.5 }}>{log.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Audit trail ─── */}
      {tab === "audit" && (
        <div className="card fade-in">
          <div className="card-head"><span style={{ fontWeight: 700 }}>Audit trail</span></div>
          <table className="tbl">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th></tr></thead>
            <tbody>
              {AUDIT_LOG.map((a, i) => (
                <tr key={i}>
                  <td style={{ color: "rgba(244,246,250,0.4)", fontSize: 12 }}>{a.time}</td>
                  <td style={{ fontWeight: 600 }}>{a.user}</td>
                  <td>{a.action}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 12, color: CHART_SERIES[0] }}>{a.resource}</td>
                  <td style={{ color: "rgba(244,246,250,0.35)", fontSize: 12 }}>{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
