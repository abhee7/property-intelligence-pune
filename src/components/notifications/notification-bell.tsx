// src/components/notifications/notification-bell.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, AlertTriangle, CheckCircle2, Shield, Newspaper, Scale, FileText, Bot, Building2, X } from "lucide-react";
import { CHART_SERIES, CHART_STATUS } from "@/lib/chart-theme";

const ICONS: Record<string, any> = { AlertTriangle, CheckCircle2, Shield, Newspaper, Scale, FileText, Bot, Building2 };

interface BellNotification {
  id: string;
  subject: string;
  body: string;
  icon: string;
  iconColor: string;
  time: string;
  read: boolean;
}

const DEMO: BellNotification[] = [
  { id: "b1", subject: "Risk Alert — Survey 118", body: "Risk score updated to 73 (HIGH)", icon: "AlertTriangle", iconColor: CHART_STATUS.critical, time: "2h ago", read: false },
  { id: "b2", subject: "Duplicate Detected", body: "S.No.299/12 — 2 broker listings", icon: "Shield", iconColor: CHART_SERIES[6], time: "5h ago", read: false },
  { id: "b3", subject: "Verification Complete", body: "Plot 42, Kharadi — all checks passed", icon: "CheckCircle2", iconColor: CHART_STATUS.good, time: "1d ago", read: false },
  { id: "b4", subject: "OCR Processed", body: "14 fields extracted, 91% confidence", icon: "FileText", iconColor: CHART_SERIES[0], time: "2d ago", read: true },
  { id: "b5", subject: "News Mention", body: "Sakal article matches Farm Plot, Mulshi", icon: "Newspaper", iconColor: CHART_STATUS.warning, time: "3d ago", read: true },
];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(DEMO);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter(i => !i.read).length;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function markRead(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i));
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
              <button onClick={() => setItems(prev => prev.map(i => ({ ...i, read: true })))} style={{ fontSize: 12, color: "rgba(244,246,250,0.6)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>
            )}
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {items.map(item => {
              const Icon = ICONS[item.icon] || Bell;
              return (
                <div key={item.id} onClick={() => markRead(item.id)} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", background: item.read ? "transparent" : "rgba(244,246,250,0.03)", transition: "background 0.1s" }}>
                  {!item.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F4F6FA", flexShrink: 0, marginTop: 7 }} />}
                  {item.read && <div style={{ width: 6 }} />}
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${item.iconColor}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} color={item.iconColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: item.read ? 500 : 700 }}>{item.subject}</div>
                    <div style={{ fontSize: 12, color: "rgba(244,246,250,0.45)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.body}</div>
                    <div style={{ fontSize: 11, color: "rgba(244,246,250,0.35)", marginTop: 3 }}>{item.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
            <a href="/notifications" style={{ fontSize: 13, color: "#F4F6FA", textDecoration: "none", fontWeight: 700 }}>View all notifications</a>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
