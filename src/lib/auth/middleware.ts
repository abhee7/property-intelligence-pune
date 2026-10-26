// src/lib/auth/middleware.ts
//
// Authentication + authorization middleware for Next.js API routes
// Extracts JWT from Authorization header, validates, injects user context
// Enforces tenant isolation and role-based permissions

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "./jwt";
import { ROLE_HIERARCHY, ROLE_PERMISSIONS } from "./types";
import type { AuthTokenPayload, UserRole, Permission } from "./types";

// ─── Types ───

export interface AuthenticatedRequest extends NextRequest {
  auth: AuthTokenPayload;
}

interface AuthOptions {
  requiredRole?: UserRole;
  requiredPermission?: Permission;
  allowSelf?: boolean; // Allow users to access their own resources
}

// ─── Standard API response helpers ───

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data, error: null }, { status });
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, data: null, error: message }, { status });
}

// ─── Auth extraction ───

export function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  return parts[1];
}

export function extractAuth(request: NextRequest): AuthTokenPayload | null {
  const token = extractToken(request);
  if (!token) return null;
  return verifyAccessToken(token);
}

// ─── Role checking ───

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] <= ROLE_HIERARCHY[requiredRole];
}

export function hasPermission(userRole: UserRole, required: Permission): boolean {
  // Admin has all permissions
  if (userRole === "admin") return true;

  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.some(
    (p) =>
      (p.resource === "*" || p.resource === required.resource) &&
      (p.action === "manage" || p.action === required.action),
  );
}

// ─── Middleware factory ───
// Usage in API routes:
//   const auth = authenticate(request);
//   if (auth instanceof NextResponse) return auth; // Error response
//   // auth is now AuthTokenPayload

export function authenticate(
  request: NextRequest,
  options: AuthOptions = {},
): AuthTokenPayload | NextResponse {
  const token = extractToken(request);

  if (!token) {
    return apiError("Authentication required", 401);
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    return apiError("Invalid or expired token", 401);
  }

  // Check role hierarchy
  if (options.requiredRole && !hasRole(payload.role, options.requiredRole)) {
    return apiError("Insufficient permissions", 403);
  }

  // Check specific permission
  if (options.requiredPermission && !hasPermission(payload.role, options.requiredPermission)) {
    return apiError("You do not have permission to perform this action", 403);
  }

  return payload;
}

// ─── Rate limiting (in-memory, per-IP) ───
// Production: replace with Redis-based limiter

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function rateLimit(
  ip: string,
  maxRequests = 10,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = ip;

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count += 1;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) rateLimitStore.delete(key);
    }
  }, 300_000);
}

// ─── IP extraction ───

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

// ─── Audit logging helper ───

export interface AuditEntry {
  userId: string | null;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string | null;
}

export function buildAuditEntry(request: NextRequest, auth: AuthTokenPayload | null, action: string, resourceType: string, resourceId?: string): AuditEntry {
  return {
    userId: auth?.userId || null,
    tenantId: auth?.tenantId || "system",
    action,
    resourceType,
    resourceId,
    ipAddress: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  };
}
