// src/components/admin/admin-panel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users, Shield, Server, Database, Cpu, Clock, Search, Zap, Bot, Lock, Unlock, Loader2, AlertTriangle, Activity,
} from "lucide-react";
import { CHART_SERIES, CHART_STATUS } from "@/lib/chart-theme";
import { useAuth } from "@/lib/auth/auth-provider";

// ─── Types (what /api/admin/* returns) ───

interface AdminUserRow {
  id: string; email: string; firstName: string; lastName: string;
  role: string; roleDisplay: string; isActive: boolean; lastLoginAt: string | null;
}
interface SystemHealth {
  status: "healthy" | "degraded" | "down";
  uptime: string;
  database: { status: string; latencyMs: number };
  providers: Record<string, { provider: string; type: string }>;
  memory: { used: string; total: string; percent: number };
  counts: { users: number; properties: number; documents: number; notifications: number };
  recentErrors: { time: string; service: string; message: string }[];
}
interface AuditRow {
  id: string; action: string; resourceType: string; resourceId: string | null; ipAddress: string | null; createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

type AdminTab = "users" | "health" | "logs" | "audit";

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin: { bg: "rgba(244,246,250,0.12)", color: "#F4F6FA" },
  agency_admin: { bg: `${CHART_SERIES[6]}1f`, color: CHART_SERIES[6] },
  broker: { bg: `${CHART_SERIES[0]}1f`, color: CHART_SERIES[0] },
  land_owner: { bg: `${CHART_STATUS.good}1f`, color: CHART_STATUS.good },
};

const PROVIDER_LABELS: Record<string, string> = {
  ocr: "OCR engine", govRecords: "Land records", courtRecords: "Court records", news: "News",
  notification: "Notifications", riskEngine: "Risk engine", storage: "Storage", aiAgent: "AI agent",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// ─── Component ───

export default function AdminPanel() {
  const { user, getAccessToken } = useAuth();
  const [tab, setTab] = useState<AdminTab>("users");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const isPlatformAdmin = user?.role === "admin";

  const api = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = getAccessToken();
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
      return json.data;
    },
    [getAccessToken],
  );

  const load = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setLoading((l) => ({ ...l, [key]: true }));
      setErrors((e) => ({ ...e, [key]: "" }));
      try {
        await fn();
      } catch (err: any) {
        setErrors((e) => ({ ...e, [key]: err.message || "Something went wrong" }));
      } finally {
        setLoading((l) => ({ ...l, [key]: false }));
      }
    },
    [],
  );

  const loadUsers = useCallback(
    () => load("users", async () => {
      const q = userSearch.trim() ? `&q=${encodeURIComponent(userSearch.trim())}` : "";
      const data = await api(`/api/admin/users?limit=50${q}`);
      setUsers(data.users);
      setUsersTotal(data.total);
    }),
    [api, load, userSearch],
  );

  // users reload when the search settles
  useEffect(() => {
    const t = setTimeout(loadUsers, 250);
    return () => clearTimeout(t);
  }, [loadUsers]);

  useEffect(() => {
    if (tab === "health" || tab === "logs") load("health", async () => setHealth((await api("/api/admin/system")).health));
    if (tab === "audit") load("audit", async () => {
      const data = await api("/api/admin/system?view=audit");
      setAudit(data.logs);
      setAuditTotal(data.total);
    });
  }, [tab, api, load]);

  async function toggleActive(u: AdminUserRow) {
    setBusyUser(u.id);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !u.isActive }) });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x)));
    } catch (err: any) {
      setErrors((e) => ({ ...e, users: err.message }));
    } finally {
      setBusyUser(null);
    }
  }

  const tabs: { key: AdminTab; label: string; icon: any }[] = [
    { key: "users", label: "Users", icon: Users },
    { key: "health", label: "System health", icon: Activity },
    { key: "logs", label: "Processing log", icon: Bot },
    { key: "audit", label: "Audit trail", icon: Shield },
  ];

  const Notice = ({ keyName }: { keyName: string }) =>
    errors[keyName] ? (
      <div style={{ padding: "14px 20px", color: CHART_STATUS.warning, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
        <AlertTriangle size={15} /> {errors[keyName]}
        {/Forbidden|permission|403/i.test(errors[keyName]) && " — sign in as the platform admin (admin@sahyadri-demo.com) to see this."}
      </div>
    ) : null;
  const Spinner = ({ keyName }: { keyName: string }) =>
    loading[keyName] ? (
      <div style={{ padding: 20, color: "rgba(244,246,250,0.45)", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
        <Loader2 size={15} className="animate-spin" /> Loading…
      </div>
    ) : null;

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
        {tabs.map((t) => (
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
              <span style={{ fontWeight: 700 }}>Users ({usersTotal})</span>
              <div style={{ position: "relative", width: 240 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: 10, color: "rgba(244,246,250,0.4)" }} />
                <input className="search-input" placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              </div>
            </div>
          </div>
          <Notice keyName="users" />
          <table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th>{isPlatformAdmin && <th>Actions</th>}</tr></thead>
            <tbody>
              {users.map((u) => {
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
                    <td style={{ color: "rgba(244,246,250,0.4)" }}>{when(u.lastLoginAt)}</td>
                    {isPlatformAdmin && (
                      <td>
                        <button className="btn-sm" disabled={busyUser === u.id || u.id === user?.id} onClick={() => toggleActive(u)} title={u.id === user?.id ? "You can't deactivate yourself" : u.isActive ? "Deactivate" : "Activate"}>
                          {u.isActive ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!loading.users && users.length === 0 && !errors.users && (
                <tr><td colSpan={5} style={{ color: "rgba(244,246,250,0.4)", textAlign: "center", padding: 24 }}>No users match.</td></tr>
              )}
            </tbody>
          </table>
          <Spinner keyName="users" />
          {!isPlatformAdmin && (
            <div style={{ padding: "12px 20px", fontSize: 12, color: "rgba(244,246,250,0.4)" }}>Only the platform admin can activate or deactivate users.</div>
          )}
        </div>
      )}

      {/* ─── System health ─── */}
      {tab === "health" && (
        <div className="fade-in">
          <Notice keyName="health" />
          <Spinner keyName="health" />
          {health && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "System", value: health.status === "healthy" ? "Healthy" : health.status === "degraded" ? "Degraded" : "Down", icon: Server, color: health.status === "healthy" ? CHART_STATUS.good : CHART_STATUS.warning },
                  { label: "Database", value: `${health.database.status === "connected" ? "Connected" : "Slow"} (${health.database.latencyMs} ms)`, icon: Database, color: health.database.status === "connected" ? CHART_STATUS.good : CHART_STATUS.warning },
                  { label: "Memory (heap)", value: `${health.memory.used} / ${health.memory.total}`, icon: Cpu, color: CHART_SERIES[0] },
                  { label: "Uptime", value: health.uptime, icon: Clock, color: CHART_SERIES[0] },
                ].map((s, i) => (
                  <div key={i} className="card" style={{ padding: 16, textAlign: "center" }}>
                    <s.icon size={20} color={s.color} style={{ margin: "0 auto 8px", display: "block" }} />
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: "rgba(244,246,250,0.45)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-head">
                  <span style={{ fontWeight: 700 }}>Data on file</span>
                </div>
                <table className="tbl">
                  <tbody>
                    {Object.entries(health.counts).map(([k, v]) => (
                      <tr key={k}><td style={{ textTransform: "capitalize" }}>{k}</td><td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v.toLocaleString("en-IN")}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <div className="card-head">
                  <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Zap size={15} color="#F4F6FA" /> Data providers</span>
                  <span className="pill" style={{ background: "rgba(244,246,250,0.08)", color: "rgba(244,246,250,0.6)" }}>Configured in .env (PROVIDER_*)</span>
                </div>
                <table className="tbl">
                  <thead><tr><th>Service</th><th>Provider</th><th>Mode</th></tr></thead>
                  <tbody>
                    {Object.entries(health.providers).map(([k, p]) => (
                      <tr key={k}>
                        <td style={{ fontWeight: 600 }}>{PROVIDER_LABELS[k] || k}</td>
                        <td style={{ color: "rgba(244,246,250,0.55)" }}>{p.provider}</td>
                        <td><span className="pill" style={{ background: "rgba(244,246,250,0.08)", color: "rgba(244,246,250,0.55)" }}>{p.type}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Processing log ─── */}
      {tab === "logs" && (
        <div className="card fade-in">
          <div className="card-head">
            <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Bot size={15} color="#F4F6FA" /> Documents needing attention</span>
          </div>
          <Notice keyName="health" />
          <Spinner keyName="health" />
          {health && health.recentErrors.length === 0 && <div style={{ padding: 20, color: "rgba(244,246,250,0.45)", fontSize: 13 }}>No failed or low-confidence documents.</div>}
          {health?.recentErrors.map((log, i) => (
            <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: CHART_STATUS.warning, flexShrink: 0, marginTop: 7 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{log.service}</span>
                  <span style={{ fontSize: 11, color: "rgba(244,246,250,0.35)", marginLeft: "auto" }}>{when(log.time)}</span>
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
          <div className="card-head"><span style={{ fontWeight: 700 }}>Audit trail ({auditTotal})</span></div>
          <Notice keyName="audit" />
          <Spinner keyName="audit" />
          <table className="tbl">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td style={{ color: "rgba(244,246,250,0.4)", fontSize: 12 }}>{when(a.createdAt)}</td>
                  <td style={{ fontWeight: 600 }}>{a.user ? `${a.user.firstName} ${a.user.lastName}` : "System"}</td>
                  <td>{a.action}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono',ui-monospace,monospace", fontSize: 12, color: CHART_SERIES[0] }}>{a.resourceType}{a.resourceId ? ` · ${a.resourceId.slice(0, 14)}` : ""}</td>
                  <td style={{ color: "rgba(244,246,250,0.35)", fontSize: 12 }}>{a.ipAddress || "—"}</td>
                </tr>
              ))}
              {!loading.audit && audit.length === 0 && !errors.audit && (
                <tr><td colSpan={5} style={{ color: "rgba(244,246,250,0.4)", textAlign: "center", padding: 24 }}>Nothing recorded yet. Logins, uploads, match decisions and user changes appear here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
