"use client";

import React from "react";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { AppHeader } from "@/components/shared/app-header";
import { Backdrop } from "@/components/shared/backdrop";

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-void text-platinum flex font-inter relative">
      {/* Ambient glass depth — a faint wireframe terrain mesh plus soft
          colored bokeh, so backdrop-blur surfaces have visible texture
          and light to refract instead of tinting flat black. */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="fixed inset-0"
          style={{
            backgroundImage: "url(/mesh-bg.svg)",
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            backgroundRepeat: "no-repeat",
            opacity: 0.55,
          }}
        />
        <div
          className="fixed inset-0"
          style={{ background: "radial-gradient(120% 70% at 15% -10%, rgba(244,246,250,0.05), transparent 55%), radial-gradient(100% 60% at 100% 0%, rgba(244,246,250,0.03), transparent 50%)" }}
        />
        {/* Soft radial-gradient glows instead of filter:blur() — a blurred
            560px circle forces the browser to rasterize a much larger
            padded bitmap and run a heavy gaussian pass on it every time
            the layer repaints; a radial-gradient gets the same soft glow
            for close to free since the falloff is baked into the paint. */}
        <div
          className="absolute rounded-full"
          style={{ top: "-14%", right: "-10%", width: 820, height: 820, background: "radial-gradient(circle, rgba(57,135,229,0.16) 0%, rgba(57,135,229,0.06) 40%, transparent 70%)" }}
        />
        <div
          className="absolute rounded-full"
          style={{ bottom: "-22%", left: "-14%", width: 900, height: 900, background: "radial-gradient(circle, rgba(144,133,233,0.13) 0%, rgba(144,133,233,0.05) 40%, transparent 70%)" }}
        />
        <div
          className="absolute rounded-full"
          style={{ top: "28%", left: "38%", width: 650, height: 650, background: "radial-gradient(circle, rgba(25,158,112,0.09) 0%, rgba(25,158,112,0.03) 40%, transparent 70%)" }}
        />
      </div>

      {/* Sidebar & Overlay */}
      <AppSidebar />
      <Backdrop />

      {/* Main Content Area */}
      <div
        className={`relative flex-1 flex flex-col min-w-0 transition-[margin-left] duration-200 ease-out ${
          isExpanded || isHovered ? "lg:ml-[312px]" : "lg:ml-[120px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <main className="flex-1 mt-24 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <ThemeProvider>
          <SidebarProvider>
            <DashboardLayoutContent>{children}</DashboardLayoutContent>
          </SidebarProvider>
        </ThemeProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}
