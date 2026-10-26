// src/components/auth/protected-route.tsx
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import type { UserRole } from "@/lib/auth/types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, requiredRole, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasMinRole, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  // Loading state
  if (isLoading) {
    return fallback || <LoadingSkeleton />;
  }

  // Not authenticated
  if (!isAuthenticated) {
    return fallback || <LoadingSkeleton />;
  }

  // Role check
  if (requiredRole && !hasMinRole(requiredRole)) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "60vh", flexDirection: "column", gap: 16, padding: 24,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: "rgba(239,68,68,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24,
        }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Access denied</h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: 0, textAlign: "center", maxWidth: 320 }}>
          You don&apos;t have permission to view this page. Contact your administrator if you believe this is an error.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "8px 20px", borderRadius: 8,
            background: "#6366f1", color: "white",
            border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}
        >
          Go to dashboard
        </button>
      </div>
    );
  }

  return children;
}

// ─── Loading skeleton ───

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#09090b" }}>
      {/* Sidebar skeleton */}
      <div style={{
        width: 240, borderRight: "1px solid rgba(255,255,255,0.06)",
        padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ height: 32, width: 140, borderRadius: 8, background: "rgba(255,255,255,0.04)" }} />
        <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "8px 0" }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            height: 36, borderRadius: 8, background: "rgba(255,255,255,0.03)",
            animation: "pulse 1.8s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
          }} />
        ))}
      </div>
      {/* Content skeleton */}
      <div style={{ flex: 1, padding: 24 }}>
        <div style={{ height: 40, width: 200, borderRadius: 8, background: "rgba(255,255,255,0.04)", marginBottom: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              height: 100, borderRadius: 14, background: "rgba(255,255,255,0.03)",
              animation: "pulse 1.8s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
        <div style={{
          height: 300, borderRadius: 14, background: "rgba(255,255,255,0.03)",
          animation: "pulse 1.8s ease-in-out infinite",
        }} />
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
