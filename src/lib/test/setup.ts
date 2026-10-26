// src/lib/test/setup.ts

import { vi } from "vitest";

// ─── Mock Prisma ───
// Prevents actual DB calls during unit tests

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    tenant: { findUnique: vi.fn(), create: vi.fn() },
    tenantSettings: { findUnique: vi.fn(), create: vi.fn() },
    role: { findUnique: vi.fn() },
    property: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    document: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    notification: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    notificationPreference: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    riskScore: { findMany: vi.fn() },
    courtCase: { findMany: vi.fn() },
    newspaperPropertyMention: { findMany: vi.fn() },
    userSession: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    loginAttempt: { create: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
  runWithTenant: vi.fn((_, fn) => fn()),
  getTenantContext: vi.fn(() => "t-test-001"),
}));

// ─── Test fixtures ───

export const TEST_TENANT = {
  id: "t-test-001",
  name: "Test Tenant",
  slug: "test-tenant",
  plan: "PROFESSIONAL",
  isActive: true,
};

export const TEST_USER = {
  id: "user-test-001",
  tenantId: "t-test-001",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  phone: "+919876543210",
  passwordHash: "$2b$12$LJ3m5RCv4TmEZ5K7UQwgSe1R2fL2Dy1H8bX5xJpPQ5xY6Oj2qFiS", // "Test@12345"
  isActive: true,
  mfaEnabled: false,
  emailVerifiedAt: null,
  lastLoginAt: new Date(),
  createdAt: new Date("2026-01-01"),
  avatarUrl: null,
  roleId: "role-broker",
  role: { id: "role-broker", name: "broker", displayName: "Broker", hierarchyLevel: 3, isSystem: true },
  tenant: { id: "t-test-001", name: "Test Tenant", slug: "test-tenant", plan: "PROFESSIONAL", isActive: true },
};

export const TEST_ADMIN = {
  ...TEST_USER,
  id: "user-admin-001",
  email: "admin@example.com",
  firstName: "Admin",
  roleId: "role-admin",
  role: { id: "role-admin", name: "admin", displayName: "Platform admin", hierarchyLevel: 1, isSystem: true },
};

export const TEST_PROPERTY = {
  id: "prop-test-001",
  tenantId: "t-test-001",
  title: "Test Plot, Kharadi",
  surveyNumber: "118/2A",
  khasraNumber: "4521/87",
  price: 4800000,
  areaSqft: 2400,
  status: "LISTED",
  metadata: { taluka: "Haveli", village: "Kharadi" },
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-07-01"),
};

// ─── Mock NextRequest factory ───

export function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  searchParams?: Record<string, string>;
} = {}): Request {
  const url = new URL(options.url || "http://localhost:3000/api/test");
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  return new Request(url.toString(), {
    method: options.method || "GET",
    headers: new Headers({
      "Content-Type": "application/json",
      ...options.headers,
    }),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}
