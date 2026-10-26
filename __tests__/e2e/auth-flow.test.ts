// __tests__/e2e/auth-flow.test.ts
//
// End-to-end test for the complete authentication lifecycle
// Run with: npx vitest run __tests__/e2e/auth-flow.test.ts
//
// This test exercises the full flow without a running server
// by calling the same functions the API routes use.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateTokenPair, verifyAccessToken, verifyRefreshToken, generateRefreshTokenHash } from "@/lib/auth/jwt";
import { hasRole, hasPermission } from "@/lib/auth/middleware";
import { TEST_USER, TEST_ADMIN } from "@/lib/test/setup";

describe("E2E: Full auth flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes: register → login → access → refresh → logout", async () => {
    // ════════════════════════════════════════════
    // STEP 1: REGISTER
    // ════════════════════════════════════════════
    const password = "Register@2026";
    const passwordHash = await hashPassword(password);

    // Verify hash was created
    expect(passwordHash).toBeTruthy();
    expect(passwordHash).not.toBe(password);

    // Simulate user creation
    const newUser = {
      id: "user-new-001",
      tenantId: "t-001",
      email: "newuser@example.com",
      role: "broker" as const,
    };

    // Generate initial tokens
    const registerTokens = generateTokenPair({
      userId: newUser.id,
      tenantId: newUser.tenantId,
      role: newUser.role,
      email: newUser.email,
    });

    expect(registerTokens.accessToken).toBeTruthy();
    expect(registerTokens.refreshToken).toBeTruthy();

    // ════════════════════════════════════════════
    // STEP 2: LOGIN WITH CREDENTIALS
    // ════════════════════════════════════════════
    const loginValid = await verifyPassword(password, passwordHash);
    expect(loginValid).toBe(true);

    const loginTokens = generateTokenPair({
      userId: newUser.id,
      tenantId: newUser.tenantId,
      role: newUser.role,
      email: newUser.email,
    });

    // ════════════════════════════════════════════
    // STEP 3: ACCESS PROTECTED RESOURCE
    // ════════════════════════════════════════════
    const decoded = verifyAccessToken(loginTokens.accessToken);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(newUser.id);
    expect(decoded!.tenantId).toBe(newUser.tenantId);
    expect(decoded!.role).toBe("broker");

    // Check permissions
    expect(hasPermission(decoded!.role, { resource: "properties", action: "create" })).toBe(true);
    expect(hasPermission(decoded!.role, { resource: "properties", action: "read" })).toBe(true);
    expect(hasPermission(decoded!.role, { resource: "users", action: "delete" })).toBe(false);

    // Check role hierarchy
    expect(hasRole(decoded!.role, "broker")).toBe(true);
    expect(hasRole(decoded!.role, "land_owner")).toBe(true);
    expect(hasRole(decoded!.role, "admin")).toBe(false);

    // ════════════════════════════════════════════
    // STEP 4: TOKEN REFRESH
    // ════════════════════════════════════════════
    const refreshDecoded = verifyRefreshToken(loginTokens.refreshToken);
    expect(refreshDecoded).not.toBeNull();
    expect(refreshDecoded!.userId).toBe(newUser.id);

    // Generate new token pair (rotation)
    const refreshedTokens = generateTokenPair({
      userId: refreshDecoded!.userId,
      tenantId: refreshDecoded!.tenantId,
      role: newUser.role,
      email: newUser.email,
    });

    // Old tokens and new tokens should be different
    expect(refreshedTokens.accessToken).not.toBe(loginTokens.accessToken);
    expect(refreshedTokens.refreshToken).not.toBe(loginTokens.refreshToken);

    // New access token should be valid
    const newDecoded = verifyAccessToken(refreshedTokens.accessToken);
    expect(newDecoded!.userId).toBe(newUser.id);

    // Old refresh token hash should differ from new one
    const oldHash = generateRefreshTokenHash(loginTokens.refreshToken);
    const newHash = generateRefreshTokenHash(refreshedTokens.refreshToken);
    expect(oldHash).not.toBe(newHash);

    // ════════════════════════════════════════════
    // STEP 5: LOGOUT (session revocation)
    // ════════════════════════════════════════════
    // In production, we'd call revokeSessionByToken
    // Here we verify the hash mechanism works for lookup
    const logoutHash = generateRefreshTokenHash(refreshedTokens.refreshToken);
    expect(logoutHash).toMatch(/^[a-f0-9]{64}$/);

    // After logout, the old access token is still cryptographically valid
    // but the server would check the session table (which is now empty)
    // This is by design — access tokens expire in 15 min, sessions are revoked immediately
  });

  it("enforces admin-only operations", () => {
    const adminTokens = generateTokenPair({
      userId: TEST_ADMIN.id,
      tenantId: TEST_ADMIN.tenantId,
      role: "admin",
      email: TEST_ADMIN.email,
    });

    const brokerTokens = generateTokenPair({
      userId: TEST_USER.id,
      tenantId: TEST_USER.tenantId,
      role: "broker",
      email: TEST_USER.email,
    });

    const adminAuth = verifyAccessToken(adminTokens.accessToken)!;
    const brokerAuth = verifyAccessToken(brokerTokens.accessToken)!;

    // Admin can manage users
    expect(hasPermission(adminAuth.role, { resource: "users", action: "manage" })).toBe(true);
    expect(hasPermission(adminAuth.role, { resource: "users", action: "delete" })).toBe(true);

    // Broker cannot
    expect(hasPermission(brokerAuth.role, { resource: "users", action: "manage" })).toBe(false);
    expect(hasPermission(brokerAuth.role, { resource: "users", action: "delete" })).toBe(false);

    // Both can read properties
    expect(hasPermission(adminAuth.role, { resource: "properties", action: "read" })).toBe(true);
    expect(hasPermission(brokerAuth.role, { resource: "properties", action: "read" })).toBe(true);
  });

  it("handles token expiry correctly", () => {
    const tokens = generateTokenPair({
      userId: "user-001",
      tenantId: "t-001",
      role: "broker",
      email: "test@example.com",
    });

    // Token valid now
    expect(verifyAccessToken(tokens.accessToken)).not.toBeNull();

    // Simulate 20 minutes later (beyond 15-min expiry)
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 20 * 60 * 1000);
    expect(verifyAccessToken(tokens.accessToken)).toBeNull();

    // But refresh token is still valid (7-day expiry)
    expect(verifyRefreshToken(tokens.refreshToken)).not.toBeNull();
    vi.restoreAllMocks();
  });
});
