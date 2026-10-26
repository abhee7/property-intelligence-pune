// src/lib/auth/types.ts

export type UserRole = "admin" | "agency_admin" | "broker" | "land_owner";

export interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface SessionInfo {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthResult {
  user: AuthUser;
  tokens: TokenPair;
}

// RBAC permission definitions
export interface Permission {
  resource: string;
  action: "create" | "read" | "update" | "delete" | "manage";
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 1,
  agency_admin: 2,
  broker: 3,
  land_owner: 4,
};

// Role permissions matrix
// Higher roles inherit all permissions of lower roles
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    { resource: "*", action: "manage" },
  ],
  agency_admin: [
    { resource: "properties", action: "manage" },
    { resource: "documents", action: "manage" },
    { resource: "verifications", action: "manage" },
    { resource: "users", action: "read" },
    { resource: "users", action: "create" },
    { resource: "users", action: "update" },
    { resource: "risk_scores", action: "read" },
    { resource: "notifications", action: "manage" },
    { resource: "newspaper", action: "read" },
    { resource: "court_cases", action: "read" },
    { resource: "ai_agents", action: "manage" },
    { resource: "analytics", action: "read" },
  ],
  broker: [
    { resource: "properties", action: "create" },
    { resource: "properties", action: "read" },
    { resource: "properties", action: "update" },
    { resource: "documents", action: "create" },
    { resource: "documents", action: "read" },
    { resource: "verifications", action: "create" },
    { resource: "verifications", action: "read" },
    { resource: "risk_scores", action: "read" },
    { resource: "notifications", action: "read" },
    { resource: "newspaper", action: "read" },
    { resource: "court_cases", action: "read" },
    { resource: "ai_agents", action: "create" },
    { resource: "ai_agents", action: "read" },
  ],
  land_owner: [
    { resource: "properties", action: "read" },
    { resource: "documents", action: "read" },
    { resource: "verifications", action: "read" },
    { resource: "risk_scores", action: "read" },
    { resource: "notifications", action: "read" },
    { resource: "court_cases", action: "read" },
  ],
};
