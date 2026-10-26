"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  LayoutDashboard,
  Building2,
  Map,
  ShieldAlert,
  FileCheck,
  GitMerge,
  Scale,
  Newspaper,
  Briefcase,
  UserCheck,
  Users,
  BarChart3,
  Settings,
  ChevronDown,
  MoreHorizontal,
  Zap,
} from "lucide-react";

export type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  adminOnly?: boolean;
  subItems?: { name: string; path: string; badge?: string }[];
};

const mainNavItems: NavItem[] = [
  {
    name: "Dashboard",
    icon: <LayoutDashboard className="w-5 h-5" />,
    path: "/dashboard",
  },
  {
    name: "Properties",
    icon: <Building2 className="w-5 h-5" />,
    path: "/properties",
  },
  {
    name: "Property Map",
    icon: <Map className="w-5 h-5" />,
    path: "/map",
  },
];

const intelligenceNavItems: NavItem[] = [
  {
    name: "Risk Analysis",
    icon: <ShieldAlert className="w-5 h-5" />,
    path: "/risk-analysis",
  },
  {
    name: "Document Verification",
    icon: <FileCheck className="w-5 h-5" />,
    path: "/document-verification",
  },
  {
    name: "Matching",
    icon: <GitMerge className="w-5 h-5" />,
    path: "/matching",
  },
  {
    name: "Court Cases",
    icon: <Scale className="w-5 h-5" />,
    path: "/court-cases",
  },
  {
    name: "News Intelligence",
    icon: <Newspaper className="w-5 h-5" />,
    path: "/news-intelligence",
  },
];

const managementNavItems: NavItem[] = [
  {
    name: "Brokers",
    icon: <Briefcase className="w-5 h-5" />,
    path: "/management/brokers",
    adminOnly: true,
  },
  {
    name: "Land Owners",
    icon: <UserCheck className="w-5 h-5" />,
    path: "/management/owners",
    adminOnly: true,
  },
  {
    name: "Users",
    icon: <Users className="w-5 h-5" />,
    path: "/management/users",
    adminOnly: true,
  },
];

const systemNavItems: NavItem[] = [
  {
    name: "Reports",
    icon: <BarChart3 className="w-5 h-5" />,
    path: "/analytics",
  },
  {
    name: "Settings",
    icon: <Settings className="w-5 h-5" />,
    path: "/settings",
  },
];

export function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { user, hasMinRole } = useAuth();

  const isActive = useCallback(
    (path?: string) => {
      if (!path) return false;
      if (path === "/dashboard") return pathname === "/dashboard" || pathname === "/";
      return pathname.startsWith(path);
    },
    [pathname]
  );

  const canViewItem = (item: NavItem) => {
    if (item.adminOnly && !hasMinRole("agency_admin")) {
      return false;
    }
    return true;
  };

  const renderSection = (title: string, items: NavItem[]) => {
    const visibleItems = items.filter(canViewItem);
    if (visibleItems.length === 0) return null;

    return (
      <div className="mb-6">
        <h2
          className={`mb-3 text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-platinum/35 flex items-center px-3 ${
            !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
          }`}
        >
          {isExpanded || isHovered || isMobileOpen ? (
            title
          ) : (
            <MoreHorizontal className="w-5 h-5 text-platinum/30" />
          )}
        </h2>
        <ul className="flex flex-col gap-1.5">
          {visibleItems.map((nav) => {
            const active = isActive(nav.path);
            return (
              <li key={nav.name}>
                {nav.path && (
                  <Link
                    href={nav.path}
                    className={`menu-item group ${
                      active
                        ? "menu-item-active"
                        : "menu-item-inactive"
                    } ${
                      !isExpanded && !isHovered
                        ? "lg:justify-center lg:px-0"
                        : "lg:justify-start"
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center ${
                        active ? "text-platinum" : "text-platinum/40 group-hover:text-platinum/75"
                      }`}
                    >
                      {nav.icon}
                    </span>
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <span className="menu-item-text text-sm font-medium tracking-tight font-sora">
                        {nav.name}
                      </span>
                    )}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <aside
      className={`fixed top-4 left-4 bg-[rgba(13,14,19,0.82)] backdrop-blur-lg border border-white/[0.1] rounded-[26px] text-platinum h-[calc(100vh-2rem)] transition-[width,transform] duration-200 ease-out z-50 flex flex-col justify-between px-4 overflow-hidden
        shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_-20px_rgba(0,0,0,0.85)]
        ${
          isExpanded || isMobileOpen
            ? "w-[280px]"
            : isHovered
            ? "w-[280px]"
            : "w-[88px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.012) 30%, transparent 55%)" }}
      />
      <div className="relative">
        {/* Brand Header */}
        <div
          className={`h-18 py-5 flex items-center ${
            !isExpanded && !isHovered ? "lg:justify-center" : "justify-start px-2"
          }`}
        >
          <Link href="/dashboard" className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border border-platinum/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_6px_16px_-6px_rgba(0,0,0,0.8)]"
              style={{ background: "linear-gradient(145deg, #1A1C22, #0C0D11)" }}
            >
              <Zap className="w-5 h-5 text-platinum" strokeWidth={1.75} />
            </div>
            {(isExpanded || isHovered || isMobileOpen) && (
              <div className="flex flex-col">
                <span className="font-sora font-extrabold text-lg leading-tight tracking-tight text-platinum flex items-center gap-1.5">
                  PropIntel
                  <span className="bg-white/[0.08] text-platinum/70 text-[10px] uppercase px-1.5 py-0.5 rounded font-bold border border-white/[0.1]">
                    AI
                  </span>
                </span>
                <span className="text-[11px] font-medium text-platinum/40">
                  Land &amp; Property Intelligence
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation Groups */}
        <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-180px)] duration-300 ease-linear no-scrollbar pt-2">
          {renderSection("Main", mainNavItems)}
          {renderSection("Intelligence", intelligenceNavItems)}
          {renderSection("Management", managementNavItems)}
          {renderSection("System", systemNavItems)}
        </div>
      </div>

      {/* Role Badge in Footer */}
      {(isExpanded || isHovered || isMobileOpen) && user && (
        <div className="mb-4 pi-surface pi-surface-hover p-3 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-[#0C0D11] flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #ffffff, #c7ccd6)" }}
          >
            {user.firstName?.[0]}{user.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-platinum truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[11px] text-platinum/40 capitalize truncate">
              {user.role.replace("_", " ")}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
