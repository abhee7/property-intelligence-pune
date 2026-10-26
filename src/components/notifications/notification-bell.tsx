// src/components/notifications/notification-bell.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, ShieldAlert } from "lucide-react";
import { CHART_SERIES, CHART_STATUS } from "@/lib/chart-theme";
import { useAuth } from "@/lib/auth/auth-provider";
import { timeAgo } from "@/lib/time";

interface BellNotification {
  id: string;
  subject: string | null;
  body: string;
  priority: string;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 60_000;

export function NotificationBell() {
  const { getAccessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const call = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = getAccessToken();
      if (!token) return null;
      const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
      const json = await res.json().catch(() => null);
      return json?.success ? json.data : null;
    },
    [getAccessToken],
  );

  const refresh = useCallback(async () => {
    const data = await call("/api/notifications?limit=8");
    if (data) {
      setItems(data.notifications);
      setUnread(data.unread);
    }
  }, [call]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function markRead(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, readAt: i.readAt ?? new Date().toISOString() } : i)));
    setUnread((u) => Math.max(0, u - (items.find((i) => i.id === id)?.readAt ? 0 : 1)));
    await call(`/api/notifications/${id}`, { method: "PATCH" });
  }

  async function markAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await call("/api/notifications?markAllRead=true");
  }

  return (
    <div ref={ref} style={{ position: "relative", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <button onClick={() => setOpen(!open)} aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.1)", background: open ? "rgba(244,246,250,0.1)" : "transparent", color: open ? "#F4F6FA" : "rgba(244,246,250,0.5)", cursor: "pointer", position: "relative", transition: "all 0.15s" }}>
        <Bell size={17} />
        {unread > 0 && (
          <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: CHART_SERIES[0], border: "2px solid #0A0B0F" }} />
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 360, background: "rgba(14,15,19,0.92)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, boxShadow: "0 20px 44px -16px rgba(0,0,0,0.7)", zIndex: 50, overflow: "hidden", animation: "fadeIn 0.15s ease" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Sora',sans-serif" }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 12, color: "rgba(244,246,250,0.6)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>
            )}
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {items.length === 0 && (
              <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "rgba(244,246,250,0.45)" }}>
                Nothing yet. You&apos;ll be alerted here when a property&apos;s risk rises to High or Critical.
              </div>
            )}
            {items.map((item) => {
              const read = !!item.readAt;
              const urgent = item.priority?.toLowerCase() === "urgent";
              const Icon = urgent ? ShieldAlert : AlertTriangle;
              const color = urgent ? CHART_STATUS.critical : CHART_STATUS.warning;
              return (
                <div key={item.id} onClick={() => markRead(item.id)} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", background: read ? "transparent" : "rgba(244,246,250,0.03)", transition: "background 0.1s" }}>
                  {!read ? <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F4F6FA", flexShrink: 0, marginTop: 7 }} /> : <div style={{ width: 6 }} />}
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: read ? 500 : 700 }}>{item.subject || "Notification"}</div>
                    <div style={{ fontSize: 12, color: "rgba(244,246,250,0.45)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.body}</div>
                    <div style={{ fontSize: 11, color: "rgba(244,246,250,0.35)", marginTop: 3 }}>{timeAgo(item.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
            <Link href="/notifications" onClick={() => setOpen(false)} style={{ fontSize: 13, color: "#F4F6FA", textDecoration: "none", fontWeight: 700 }}>View all notifications</Link>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
