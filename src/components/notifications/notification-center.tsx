// src/components/notifications/notification-center.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Bell, MessageSquare, Mail, Smartphone, Check, CheckCheck, X, Loader2,
  AlertTriangle, CheckCircle2, Shield, Newspaper, Scale, FileText, Bot,
  Send, Phone, Building2, Clock, Settings, Filter, Eye, Trash2,
  ChevronRight, ExternalLink, MoreHorizontal,
} from "lucide-react";
import { CHART_SERIES, CHART_STATUS } from "@/lib/chart-theme";

// ─── Demo notifications ───

const DEMO_NOTIFICATIONS = [
  { id: "n1", channel: "in_app", subject: "Risk Alert", body: "Survey 118, Hinjewadi — risk score updated to 73 (HIGH). Active court case with stay order detected.", priority: "urgent", status: "unread", icon: AlertTriangle, iconColor: CHART_STATUS.critical, time: "2 hours ago", property: "Survey 118, Hinjewadi" },
  { id: "n2", channel: "in_app", subject: "Duplicate Detected", body: "Survey S.No.299/12 appears to be listed by 2 different brokers. Match score: 92%. Review required.", priority: "high", icon: Shield, iconColor: CHART_SERIES[6], status: "unread", time: "5 hours ago", property: "Survey 118, Hinjewadi" },
  { id: "n3", channel: "in_app", subject: "Verification Complete", body: "Plot 42, Kharadi — all 6 verification checks passed. Property status updated to VERIFIED.", priority: "normal", icon: CheckCircle2, iconColor: CHART_STATUS.good, status: "unread", time: "1 day ago", property: "Plot 42, Kharadi" },
  { id: "n4", channel: "in_app", subject: "OCR Processed", body: "Title deed for Gala 3, Wagholi processed. 14 fields extracted with 91% average confidence.", priority: "normal", icon: FileText, iconColor: CHART_SERIES[0], status: "read", time: "2 days ago", property: "Gala 3, Wagholi" },
  { id: "n5", channel: "in_app", subject: "News Mention", body: "Sakal newspaper mentions Mulshi land acquisition. Matched to Farm Plot, Mulshi with 87% relevance.", priority: "normal", icon: Newspaper, iconColor: CHART_STATUS.warning, status: "read", time: "3 days ago", property: "Farm Plot, Mulshi" },
  { id: "n6", channel: "in_app", subject: "Court Case Update", body: "WP/8657/2020 — next hearing scheduled for 22/09/2026 at High Court, Bombay (Pune Bench).", priority: "high", icon: Scale, iconColor: CHART_STATUS.critical, status: "read", time: "4 days ago", property: "Survey 118, Hinjewadi" },
  { id: "n7", channel: "in_app", subject: "AI Analysis Complete", body: "Full intelligence report generated for Flat 7B, Baner. Risk score: 47 (MODERATE). 3 factors flagged.", priority: "normal", icon: Bot, iconColor: CHART_SERIES[0], status: "read", time: "5 days ago", property: "Flat 7B, Baner" },
  { id: "n8", channel: "in_app", subject: "Property Listed", body: "Row House 12, Undri has been submitted as a draft listing by broker Nitin Kale.", priority: "low", icon: Building2, iconColor: "rgba(244,246,250,0.35)", status: "read", time: "6 days ago", property: "Row House 12, Undri" },
];

const WA_TEMPLATES = [
  { label: "Risk alert — Survey 118", to: "Rahul Joshi (Broker)", phone: "+91 98765 43210", message: "🚨 *RISK ALERT*\n\n*Property:* Survey 118, Hinjewadi\n*Risk Score:* 73/100 — HIGH\n\n⚠️ Active court case WP/8657/2020 with stay order.\n\n*Action:* Review risk report in PropIntel.\n\n_Sent via PropIntel_" },
  { label: "Verification — Plot 42", to: "Amit Patil (Owner)", phone: "+91 87654 32109", message: "✅ *VERIFICATION COMPLETE*\n\n*Property:* Plot 42, Kharadi\n*Status:* All 6 checks passed\n*Risk:* LOW (18/100)\n\nView report: propintel.in/p/PROP-042\n\n_Sent via PropIntel_" },
  { label: "Duplicate — S.No.299/12", to: "Prashant Kulkarni (Admin)", phone: "+91 76543 21098", message: "🔔 *DUPLICATE DETECTED*\n\n*Survey:* S.No.299/12\n*Listed by:* 2 brokers\n*Score:* 92% match\n*Price Δ:* ₹7L (5.8%)\n\nReview in dashboard.\n\n_Sent via PropIntel_" },
];

const EMAIL_TEMPLATES = [
  { label: "Risk alert — Survey 118", to: "rahul.joshi@gmail.com", subject: "⚠️ Risk Alert: Survey 118, Hinjewadi — HIGH", body: "Dear Rahul,\n\nA risk assessment has been completed for the following property:\n\nProperty: Survey 118, Hinjewadi\nSurvey No: S.No.299/12\nRisk Score: 73/100\nRisk Level: HIGH\n\nKey findings:\n• Active court case WP/8657/2020 with interim stay order\n• Legal exposure score: 15/100 (CRITICAL)\n• 2 encumbrances registered\n• Negative news sentiment in area\n\nRecommendation: Do not proceed with transaction until court case is resolved.\n\nPlease log in to your PropIntel dashboard to review the full report.\n\nBest regards,\nPropIntel Intelligence Platform\n\n---\nThis is an automated notification. To manage your preferences, visit Settings > Notifications." },
];

// ─── Preference config ───

const PREF_EVENTS = [
  { key: "risk_alert", label: "Risk alerts", desc: "Score changes & threshold breaches" },
  { key: "verification_complete", label: "Verification complete", desc: "Verification results" },
  { key: "match_found", label: "Match detected", desc: "Duplicates & conflicts" },
  { key: "court_case_update", label: "Court updates", desc: "Hearings & orders" },
  { key: "newspaper_mention", label: "News mentions", desc: "Property in news" },
  { key: "document_processed", label: "Document processed", desc: "OCR completion" },
  { key: "property_status", label: "Property status", desc: "Status changes" },
];

// ─── Component ───

type TabKey = "inbox" | "whatsapp" | "email" | "preferences";

export default function NotificationCenter() {
  const [tab, setTab] = useState<TabKey>("inbox");
  const [notifications, setNotifications] = useState(DEMO_NOTIFICATIONS);
  const [filter, setFilter] = useState("all");
  const [waTemplate, setWaTemplate] = useState(0);
  const [emTemplate] = useState(0);
  const [waSending, setWaSending] = useState(false);
  const [waSent, setWaSent] = useState(false);
  const [emSending, setEmSending] = useState(false);
  const [emSent, setEmSent] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, Record<string, boolean>>>(() => {
    const p: Record<string, Record<string, boolean>> = {};
    PREF_EVENTS.forEach(e => { p[e.key] = { email: true, whatsapp: true, sms: false, in_app: true }; });
    return p;
  });

  const unreadCount = notifications.filter(n => n.status === "unread").length;

  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: "read" } : n));
  }
  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, status: "read" })));
  }

  async function sendWhatsApp() {
    setWaSending(true); setWaSent(false);
    await new Promise(r => setTimeout(r, 1500));
    setWaSending(false); setWaSent(true);
    setTimeout(() => setWaSent(false), 4000);
  }

  async function sendEmail() {
    setEmSending(true); setEmSent(false);
    await new Promise(r => setTimeout(r, 1500));
    setEmSending(false); setEmSent(true);
    setTimeout(() => setEmSent(false), 4000);
  }

  function togglePref(event: string, channel: string) {
    setPrefs(prev => ({
      ...prev,
      [event]: { ...prev[event], [channel]: !prev[event][channel] },
    }));
  }

  const filtered = filter === "all" ? notifications : filter === "unread" ? notifications.filter(n => n.status === "unread") : notifications.filter(n => n.priority === filter);

  const tabs: { key: TabKey; label: string; icon: any; badge?: number }[] = [
    { key: "inbox", label: "Inbox", icon: Bell, badge: unreadCount },
    { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
    { key: "email", label: "Email", icon: Mail },
    { key: "preferences", label: "Preferences", icon: Settings },
  ];

  const priorityColor: Record<string, string> = { urgent: CHART_STATUS.critical, high: CHART_STATUS.serious, normal: CHART_SERIES[0], low: "rgba(244,246,250,0.35)" };

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
        {unreadCount > 0 && <span style={{ fontSize: 13, padding: "2px 10px", borderRadius: 12, background: "rgba(208,59,59,0.16)", color: "#f08a8a", fontWeight: 700 }}>{unreadCount} unread</span>}
      </h1>

      <div className="card">
        {/* Tabs */}
        <div className="tab-bar">
          {tabs.map(t => (
            <div key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              <t.icon size={15} /> {t.label}
              {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
            </div>
          ))}
        </div>

        {/* ─── Inbox ─── */}
        {tab === "inbox" && (
          <div className="fade-in">
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["all", "unread", "urgent", "high"].map(f => (
                  <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} {f === "unread" ? `(${unreadCount})` : ""}
                  </button>
                ))}
              </div>
              {unreadCount > 0 && <button onClick={markAllRead} style={{ fontSize: 12, color: "rgba(244,246,250,0.6)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <Bell size={32} color="rgba(244,246,250,0.3)" style={{ margin: "0 auto 12px", display: "block" }} />
                <div style={{ fontWeight: 700 }}>No notifications</div>
                <div style={{ fontSize: 13, color: "rgba(244,246,250,0.35)", marginTop: 4 }}>You&apos;re all caught up</div>
              </div>
            ) : filtered.map((n, i) => (
              <div key={n.id} className={`notif-row fade-in ${n.status === "unread" ? "notif-unread" : ""}`} style={{ animationDelay: `${i * 0.03}s` }} onClick={() => markRead(n.id)}>
                <div className="notif-dot" style={{ background: n.status === "unread" ? "#F4F6FA" : "transparent" }} />
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${n.iconColor}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <n.icon size={16} color={n.iconColor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: n.status === "unread" ? 700 : 600, fontSize: 13 }}>{n.subject}</span>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: priorityColor[n.priority], flexShrink: 0 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(244,246,250,0.55)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: "rgba(244,246,250,0.35)", marginTop: 4 }}>{n.time} · {n.property}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── WhatsApp ─── */}
        {tab === "whatsapp" && (
          <div className="fade-in" style={{ padding: 24, display: "grid", gridTemplateColumns: "240px minmax(0,1fr)", gap: 24 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Templates</div>
              {WA_TEMPLATES.map((t, i) => (
                <div key={i} onClick={() => { setWaTemplate(i); setWaSent(false); }} style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 6, cursor: "pointer", border: `1px solid ${i === waTemplate ? "rgba(37,211,102,0.3)" : "rgba(255,255,255,0.08)"}`, background: i === waTemplate ? "rgba(37,211,102,0.05)" : "transparent" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(244,246,250,0.45)", marginTop: 2 }}>To: {t.to}</div>
                </div>
              ))}
              <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(37,211,102,0.05)", border: "1px solid rgba(37,211,102,0.12)", fontSize: 11, color: "rgba(244,246,250,0.55)" }}>
                <strong style={{ color: "#25D366" }}>Prototype mode</strong><br />Messages are simulated. In production, sent via Twilio WhatsApp Business API.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div className="wa-phone">
                <div style={{ background: "#1a3a2a", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center" }}><Building2 size={16} color="white" /></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>PropIntel</div><div style={{ fontSize: 11, color: "#8fbc8f" }}>Business account</div></div>
                  <Phone size={18} color="#8fbc8f" />
                </div>
                <div style={{ background: "#0a1410", padding: 16, minHeight: 340, display: "flex", flexDirection: "column", justifyContent: "flex-end", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")" }}>
                  <div style={{ background: "#1a2e23", borderRadius: "12px 12px 12px 4px", padding: "10px 14px", maxWidth: 280, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{WA_TEMPLATES[waTemplate].message}</div>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#71917a" }}>{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      {waSent && <CheckCheck size={14} color="#53bdeb" />}
                      {waSending && <Clock size={12} color="#71917a" />}
                    </div>
                  </div>
                </div>
                <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, padding: "8px 14px", borderRadius: 20, background: "#1a1a1d", fontSize: 13, color: "rgba(244,246,250,0.45)" }}>To: {WA_TEMPLATES[waTemplate].phone}</div>
                  <button onClick={sendWhatsApp} disabled={waSending || waSent} style={{ width: 40, height: 40, borderRadius: 20, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: waSent ? CHART_STATUS.good : "#25D366", color: "white", opacity: waSending ? 0.6 : 1, transition: "all 0.2s" }}>
                    {waSending ? <Loader2 size={16} className="spin" /> : waSent ? <Check size={16} /> : <Send size={16} />}
                  </button>
                </div>
                {waSent && (
                  <div style={{ padding: "10px 16px", background: "rgba(12,163,12,0.1)", borderTop: "1px solid rgba(12,163,12,0.2)", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: CHART_STATUS.good }}>
                    <CheckCheck size={14} /> Delivered to {WA_TEMPLATES[waTemplate].to.split("(")[0].trim()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Email ─── */}
        {tab === "email" && (
          <div className="fade-in" style={{ padding: 24 }}>
            <div className="email-preview" style={{ margin: "0 auto" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(244,246,250,0.4)" }}>To: {EMAIL_TEMPLATES[emTemplate].to}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, fontFamily: "'Sora',sans-serif" }}>{EMAIL_TEMPLATES[emTemplate].subject}</div>
                  <div style={{ fontSize: 11, color: "rgba(244,246,250,0.4)", marginTop: 2 }}>From: notifications@propintel.in</div>
                </div>
                <button className="btn-primary" onClick={sendEmail} disabled={emSending || emSent}>
                  {emSending ? <><Loader2 size={14} className="spin" /> Sending...</> : emSent ? <><Check size={14} /> Sent</> : <><Send size={14} /> Send email</>}
                </button>
              </div>
              <div style={{ padding: 24, fontSize: 14, lineHeight: 1.8, color: "rgba(244,246,250,0.7)", whiteSpace: "pre-wrap", fontFamily: "Georgia,serif" }}>
                {EMAIL_TEMPLATES[emTemplate].body}
              </div>
              {emSent && (
                <div style={{ padding: "12px 20px", background: "rgba(12,163,12,0.08)", borderTop: "1px solid rgba(12,163,12,0.2)", fontSize: 12, color: CHART_STATUS.good, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={14} /> Email delivered to {EMAIL_TEMPLATES[emTemplate].to} · Message ID: em_{Date.now().toString(36)}
                </div>
              )}
            </div>
            <div style={{ maxWidth: 600, margin: "16px auto 0", padding: 12, borderRadius: 10, background: "rgba(244,246,250,0.04)", border: "1px solid rgba(244,246,250,0.1)", fontSize: 11, color: "rgba(244,246,250,0.55)", textAlign: "center" }}>
              <strong style={{ color: "#F4F6FA" }}>Prototype mode</strong> — Emails are simulated. Production uses Amazon SES or SendGrid.
            </div>
          </div>
        )}

        {/* ─── Preferences ─── */}
        {tab === "preferences" && (
          <div className="fade-in" style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, fontFamily: "'Sora',sans-serif" }}>Notification preferences</div>
            <div style={{ fontSize: 13, color: "rgba(244,246,250,0.45)", marginBottom: 20 }}>Choose how you want to be notified for each event type</div>

            <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px", padding: "10px 20px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontSize: 12, color: "rgba(244,246,250,0.4)", fontWeight: 700 }}>Event</span>
                {["In-app", "Email", "WhatsApp", "SMS"].map(ch => (
                  <span key={ch} style={{ fontSize: 12, color: "rgba(244,246,250,0.4)", fontWeight: 700, textAlign: "center" }}>{ch}</span>
                ))}
              </div>
              {/* Rows */}
              {PREF_EVENTS.map((event, i) => (
                <div key={event.key} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px", padding: "14px 20px", borderBottom: i < PREF_EVENTS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{event.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(244,246,250,0.4)" }}>{event.desc}</div>
                  </div>
                  {["in_app", "email", "whatsapp", "sms"].map(ch => (
                    <div key={ch} style={{ display: "flex", justifyContent: "center" }}>
                      <button
                        className={`toggle ${prefs[event.key]?.[ch] ? "on" : "off"}`}
                        onClick={() => ch !== "in_app" ? togglePref(event.key, ch) : undefined}
                        style={ch === "in_app" ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                        title={ch === "in_app" ? "In-app notifications are always enabled" : undefined}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary"><Check size={14} /> Save preferences</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
