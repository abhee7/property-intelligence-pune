"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  Menu,
  Search,
  Bell,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Shield,
  Building,
} from "lucide-react";

export function AppHeader() {
  const router = useRouter();
  const { toggleSidebar, toggleMobileSidebar, isExpanded, isHovered } = useSidebar();
  const { user, logout } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/properties?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header
      className={`fixed top-4 right-4 left-4 z-40 flex items-center justify-between h-16 px-4 md:px-6 rounded-[22px] border border-white/[0.1] bg-[rgba(14,15,20,0.62)] backdrop-blur-lg transition-[left] duration-200 ease-out
        shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_20px_50px_-22px_rgba(0,0,0,0.75)]
        ${isExpanded || isHovered ? "lg:left-[312px]" : "lg:left-[120px]"}`}
    >
      <div
        className="absolute inset-0 rounded-[22px] pointer-events-none"
        style={{ background: "linear-gradient(120deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 30%, transparent 55%)" }}
      />
      {/* Left side: Toggle button & Search */}
      <div className="relative flex items-center gap-3 md:gap-4 flex-1 max-w-xl">
        <button
          onClick={toggleSidebar}
          aria-label="Toggle sidebar desktop"
          className="pi-icon-btn hidden lg:flex items-center justify-center p-2 rounded-xl text-platinum/50"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          onClick={toggleMobileSidebar}
          aria-label="Toggle sidebar mobile"
          className="pi-icon-btn lg:hidden flex items-center justify-center p-2 rounded-xl text-platinum/50"
        >
          <Menu className="w-5 h-5" />
        </button>

        <form onSubmit={handleSearchSubmit} className="pi-input relative w-full hidden sm:flex items-center rounded-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-platinum/35 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search properties by title, survey #, location..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
          />
        </form>
      </div>

      {/* Right side: Actions & User Menu */}
      <div className="relative flex items-center gap-2 sm:gap-3">
        {/* Notifications Button */}
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="pi-icon-btn relative p-2.5 rounded-xl text-platinum/50"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#3987e5] ring-2 ring-[#0A0B0F]"></span>
        </Link>

        {/* User Profile Dropdown */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2.5 p-1.5 pl-2 rounded-xl hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/[0.08]"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs text-[#0C0D11] flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #ffffff, #c7ccd6)" }}
              >
                {user.firstName?.[0]}{user.lastName?.[0]}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-platinum leading-tight">
                  {user.firstName} {user.lastName}
                </span>
                <span className="text-[10px] text-platinum/40 capitalize">
                  {user.role.replace("_", " ")}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-platinum/35 hidden sm:block" />
            </button>

            {dropdownOpen && (
              <div className="pi-glass absolute right-0 mt-2 w-56 py-2 rounded-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2.5 border-b border-white/[0.08]">
                  <p className="text-xs font-semibold text-platinum">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-platinum/40 truncate">
                    {user.email}
                  </p>
                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/[0.08] text-platinum/70 border border-white/[0.1]">
                    <Shield className="w-3 h-3" />
                    {user.role.replace("_", " ")}
                  </div>
                </div>

                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-platinum/70 hover:bg-white/[0.05] hover:text-platinum transition-colors"
                  >
                    <UserIcon className="w-4 h-4 text-platinum/40" />
                    Account &amp; Settings
                  </Link>
                  <Link
                    href="/properties"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-platinum/70 hover:bg-white/[0.05] hover:text-platinum transition-colors"
                  >
                    <Building className="w-4 h-4 text-platinum/40" />
                    My Properties
                  </Link>
                </div>

                <div className="pt-1 border-t border-white/[0.08]">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
