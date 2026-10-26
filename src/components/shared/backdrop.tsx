"use client";

import { useSidebar } from "@/context/SidebarContext";

export function Backdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();

  if (!isMobileOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
      onClick={toggleMobileSidebar}
    />
  );
}
