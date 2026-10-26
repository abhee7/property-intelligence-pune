"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  LayoutDashboard, Building2, FileText, ShieldAlert, Scale,
  Newspaper, GitMerge, Bell, BarChart3, Settings, LogOut, Zap, Users, ChevronDown,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/matching", label: "Matching", icon: GitMerge },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin", label: "Admin", icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasMinRole } = useAuth();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside style={{
      width: 240, borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", background: "#0a0a0c",
      fontFamily: "system-ui,-apple-system,sans-serif",
    }}>
      <style>{`
        .sb-link{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:8px;font-size:13px;font-weight:500;color:#71717a;text-decoration:none;transition:all 0.12s;border:1px solid transparent;margin:1px 0}
        .sb-link:hover{background:rgba(255,255,255,0.03);color:#a1a1aa}
        .sb-link.active{background:rgba(99,102,241,0.08);color:#818cf8;border-color:rgba(99,102,241,0.12)}
        .sb-section{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#3f3f46;padding:16px 14px 6px;margin-top:4px}
      `}</style>

      {/* Brand */}
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Zap size={17} color="white" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#fafafa" }}>PropIntel</div>
          <div style={{ fontSize: 10, color: "#52525b" }}>Intelligence Platform</div>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "0 12px" }} />

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "8px 10px", overflow: "auto" }}>
        <div className="sb-section">Navigation</div>
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && !hasMinRole("agency_admin")) return null;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className={`sb-link ${active ? "active" : ""}`}>
              <item.icon size={17} style={{ opacity: active ? 1 : 0.6 }} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "0 12px" }} />

      {/* User info + logout */}
      <div style={{ padding: "12px 14px" }}>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg,#6366f1,#a78bfa)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600, color: "white",
            }}>
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.firstName} {user.lastName}
              </div>
              <div style={{ fontSize: 11, color: "#52525b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.role.replace("_", " ")}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => logout()}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "transparent", color: "#71717a",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            transition: "all 0.15s",
          }}
          onMouseOver={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; }}
          onMouseOut={(e) => { e.currentTarget.style.color = "#71717a"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}
