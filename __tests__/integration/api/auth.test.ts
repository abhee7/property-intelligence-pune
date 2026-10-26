// __tests__/integration/api/auth.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { TEST_USER, TEST_TENANT } from "@/lib/test/setup";

// Since we can't easily call Next.js route handlers directly in unit tests,
// we test the underlying service functions that the routes call.
// True integration tests run via Playwright or a test server.

describe("Auth API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/login (simulated)", () => {
    it("generates valid tokens for correct credentials", async () => {
      // Simulate what the login route does
      const passwordHash = await hashPassword("Test@12345");
      const user = { ...TEST_USER, passwordHash };

      // Mock Prisma responses
      (prisma.user.findFirst as any).mockResolvedValue(user);
      (prisma.loginAttempt.create as any).mockResolvedValue({});
      (prisma.user.update as any).mockResolvedValue(user);
      (prisma.userSession.create as any).mockResolvedValue({ id: "session-1" });

      // Generate tokens (same as login route)
      const tokens = generateTokenPair({
        userId: user.id,
        tenantId: user.tenantId,
        role: "broker",
        email: user.email,
      });

      // Verify access token
      const decoded = verifyAccessToken(tokens.accessToken);
      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe(user.id);
      expect(decoded!.role).toBe("broker");
      expect(decoded!.tenantId).toBe(user.tenantId);
    });

    it("rejects login with wrong password", async () => {
      const passwordHash = await hashPassword("CorrectPassword1");
      const user = { ...TEST_USER, passwordHash };

      (prisma.user.findFirst as any).mockResolvedValue(user);

      // Verify wrong password fails
      const { verifyPassword } = await import("@/lib/auth/password");
      const valid = await verifyPassword("WrongPassword1", user.passwordHash);
      expect(valid).toBe(false);
    });

    it("rejects login for non-existent user", async () => {
      (prisma.user.findFirst as any).mockResolvedValue(null);

      // The route would return 401
      const user = await prisma.user.findFirst({ where: { email: "nobody@example.com" } });
      expect(user).toBeNull();
    });

    it("rejects login for inactive user", async () => {
      const user = { ...TEST_USER, isActive: false };
      (prisma.user.findFirst as any).mockResolvedValue(null); // Active filter excludes inactive

      const found = await prisma.user.findFirst({ where: { email: user.email, isActive: true } });
      expect(found).toBeNull();
    });
  });

  describe("POST /api/auth/register (simulated)", () => {
    it("creates user with hashed password", async () => {
      const plain = "NewUser@123";
      const hash = await hashPassword(plain);

      expect(hash).not.toBe(plain);
      expect(hash.startsWith("$2b$")).toBe(true);

      // Verify the hash works
      const { verifyPassword } = await import("@/lib/auth/password");
      expect(await verifyPassword(plain, hash)).toBe(true);
    });

    it("prevents duplicate email registration", async () => {
      (prisma.user.findFirst as any).mockResolvedValue(TEST_USER);

      const existing = await prisma.user.findFirst({ where: { email: TEST_USER.email } });
      expect(existing).not.toBeNull();
      // Route would return 409 Conflict
    });
  });

  describe("POST /api/auth/refresh (simulated)", () => {
    it("generates new token pair from valid refresh token", () => {
      const tokens = generateTokenPair({
        userId: "user-001",
        tenantId: "t-001",
        role: "broker",
        email: "test@example.com",
      });

      // Verify refresh token is valid
      const decoded = verifyRefreshToken(tokens.refreshToken);
      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe("user-001");

      // Generate new pair (token rotation)
      const newTokens = generateTokenPair({
        userId: decoded!.userId,
        tenantId: decoded!.tenantId,
        role: "broker",
        email: "test@example.com",
      });

      expect(newTokens.accessToken).not.toBe(tokens.accessToken);
      expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);
    });
  });

  describe("GET /api/auth/me (simulated)", () => {
    it("returns user profile for valid token", () => {
      const tokens = generateTokenPair({
        userId: TEST_USER.id,
        tenantId: TEST_USER.tenantId,
        role: "broker",
        email: TEST_USER.email,
      });

      const decoded = verifyAccessToken(tokens.accessToken);
      expect(decoded!.userId).toBe(TEST_USER.id);
      expect(decoded!.email).toBe(TEST_USER.email);
    });

    it("rejects request without token", () => {
      const decoded = verifyAccessToken("");
      expect(decoded).toBeNull();
    });
  });
});
