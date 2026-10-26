// src/components/notifications/notification-center.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Info, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";
import { CHART_SERIES, CHART_STATUS } from "@/lib/chart-theme";
import { useAuth } from "@/lib/auth/auth-provider";
import { timeAgo } from "@/lib/time";

interface Row {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  priority: string;
  readAt: string | null;
  createdAt: string;
}

type TabKey = "inbox" | "delivery";

export default function NotificationCenter() {
  const { getAccessToken } = useAuth();
  const [tab, setTab] = useState<TabKey>("inbox");
  const [rows, setRows] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const call = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = getAccessToken();
      const res = await fetch(url, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
      return json.data;
    },
    [getAccessToken],
  );

  const load = useCallback(async () => {
    try {
      const data = await call("/api/notifications?limit=50");
      setRows(data.notifications);
      setUnread(data.unread);
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row || row.readAt) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, readAt: new Date().toISOString() } : r)));
    setUnread((u) => Math.max(0, u - 1));
    await call(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  async function markAllRead() {
    setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await call("/api/notifications?markAllRead=true").catch(() => {});
  }

  const priorityOf = (n: Row) => n.priority?.toLowerCase() ?? "normal";
  const filtered = filter === "all" ? rows : filter === "unread" ? rows.filter((n) => !n.readAt) : rows.filter((n) => priorityOf(n) === filter);
  const priorityColor: Record<string, string> = { urgent: CHART_STATUS.critical, high: CHART_STATUS.serious, normal: CHART_SERIES[0], low: "rgba(244,246,250,0.35)" };

  const tabs: { key: TabKey; label: string; icon: any; badge?: number }[] = [
    { key: "inbox", label: "Inbox", icon: Bell, badge: unread },
    { key: "delivery", label: "How alerts are delivered", icon: Info },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: "#F4F6FA" }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .fade-in{animation:fadeIn 0.25s ease both}
        .card{background:rgba(20,21,27,0.62);backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(255,255,255,0.09);border-radius:18px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 50px -28px rgba(0,0,0,0.75)}
        .tab-bar{display:flex;border-bottom:1px solid rgba(255,255,255,0.08)}
        .tab{display:flex;align-items:center;gap:6px;padding:12px 20px;font-size:13px;cursor:pointer;border-bottom:2px solid transparent;color:rgba(244,246,250,0.45);transition:all 0.15s;font-weight:600}
        .tab:hover{color:rgba(244,246,250,0.75)}
        .tab.active{color:#F4F6FA;border-bottom-color:#F4F6FA}
        .tab-badge{font-size:10px;padding:1px 6px;border-radius:10px;background:rgba(208,59,59,0.18);color:#f08a8a;font-weight:700}
        .notif-row{display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;transition:background 0.1s}
        .notif-row:hover{background:rgba(255,255,255,0.03)}
        .notif-row:last-child{border-bottom:none}
        .notif-unread{background:rgba(244,246,250,0.025)}
        .notif-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:6px}
        .chip{padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,0.08);background:transparent;color:rgba(244,246,250,0.55);transition:all 0.15s}
        .chip:hover{border-color:rgba(255,255,255,0.18);color:#F4F6FA}
        .chip.active{background:rgba(244,246,250,0.12);color:#F4F6FA;border-color:rgba(244,246,250,0.24)}
        .wa-phone{width:340px;background:#111113;border-radius:24px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
        .email-preview{background:rgba(20,21,27,0.62);border:1px solid rgba(255,255,255,0.09);border-radius:16px;overflow:hidden;max-width:600px}
        .toggle{width:40px;height:22px;border-radius:11px;cursor:pointer;position:relative;transition:background 0.2s;border:none}
        .toggle.on{background:rgba(244,246,250,0.85)}
        .toggle.off{background:rgba(255,255,255,0.1)}
        .toggle::after{content:'';position:absolute;width:16px;height:16px;border-radius:50%;background:#0c0d11;top:3px;transition:left 0.2s}
        .toggle.off::after{background:rgba(244,246,250,0.4)}
        .toggle.on::after{left:21px}
        .toggle.off::after{left:3px}
        .btn-primary{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:linear-gradient(135deg,#ffffff,#c7ccd6);color:#0c0d11;transition:all 0.15s;box-shadow:0 6px 18px -6px rgba(255,255,255,0.35)}
        .btn-primary:hover{filter:brightness(1.04)}
        .btn-primary:disabled{opacity:0.6;cursor:not-allowed}
        .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 10, fontFamily: "'Sora',sans-serif", letterSpacing: "-0.02em" }}>
        <Bell size={22} color="#F4F6FA" /> Notifications
        {unread > 0 && <span style={{ fontSize: 13, padding: "2px 10px", borderRadius: 12, background: "rgba(208,59,59,0.16)", color: "#f08a8a", fontWeight: 700 }}>{unread} unread</span>}
      </h1>

      <div className="card">
        <div className="tab-bar">
          {tabs.map((t) => (
            <div key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              <t.icon size={15} /> {t.label}
              {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
            </div>
          ))}
        </div>

        {tab === "inbox" && (
          <div className="fade-in">
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["all", "unread", "urgent", "high"].map((f) => (
                  <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} {f === "unread" ? `(${unread})` : ""}
                  </button>
                ))}
              </div>
              {unread > 0 && <button onClick={markAllRead} style={{ fontSize: 12, color: "rgba(244,246,250,0.6)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>}
            </div>

            {loading && <div style={{ padding: 32, textAlign: "center", color: "rgba(244,246,250,0.45)" }}><Loader2 size={18} className="spin" style={{ display: "inline-block" }} /></div>}
            {error && <div style={{ padding: 24, color: CHART_STATUS.warning, fontSize: 13 }}>{error}</div>}
            {!loading && !error && filtered.length === 0 && (
              <div style={{ padding: 48, textAlign: "center" }}>
                <Bell size={32} color="rgba(244,246,250,0.3)" style={{ margin: "0 auto 12px", display: "block" }} />
                <div style={{ fontWeight: 700 }}>No notifications</div>
                <div style={{ fontSize: 13, color: "rgba(244,246,250,0.35)", marginTop: 4 }}>
                  An alert appears here when a property&apos;s risk rises to High or Critical, for example after a stay order is linked.
                </div>
              </div>
            )}
            {filtered.map((n, i) => {
              const urgent = priorityOf(n) === "urgent";
              const Icon = urgent ? ShieldAlert : AlertTriangle;
              const color = urgent ? CHART_STATUS.critical : CHART_STATUS.warning;
              const isUnread = !n.readAt;
              return (
                <div key={n.id} className={`notif-row fade-in ${isUnread ? "notif-unread" : ""}`} style={{ animationDelay: `${i * 0.03}s` }} onClick={() => markRead(n.id)}>
                  <div className="notif-dot" style={{ background: isUnread ? "#F4F6FA" : "transparent" }} />
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={16} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: isUnread ? 700 : 600, fontSize: 13 }}>{n.subject || "Notification"}</span>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: priorityColor[priorityOf(n)], flexShrink: 0 }} />
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(244,246,250,0.55)", lineHeight: 1.5 }}>{n.body}</div>
                    <div style={{ fontSize: 11, color: "rgba(244,246,250,0.35)", marginTop: 4 }}>{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "delivery" && (
          <div className="fade-in" style={{ padding: 24, maxWidth: 680, fontSize: 14, lineHeight: 1.7, color: "rgba(244,246,250,0.7)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, fontFamily: "'Sora',sans-serif", color: "#F4F6FA" }}>In-app only</div>
            <p style={{ margin: "0 0 12px" }}>
              PropIntel raises an alert here, and on the bell in the header, when a property&apos;s risk level rises to <strong>High</strong> or <strong>Critical</strong>.
              It goes to the property&apos;s owner and broker and to the agency admins.
            </p>
            <p style={{ margin: 0, color: "rgba(244,246,250,0.5)" }}>
              Email, WhatsApp and SMS are <strong>not connected</strong>, so nothing is sent through them. The code has a place for those providers
              (<code>PROVIDER_NOTIFICATION</code>), but they would need an account with a messaging provider.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
