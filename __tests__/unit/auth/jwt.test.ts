// __tests__/unit/auth/jwt.test.ts

import { describe, it, expect, vi } from "vitest";
import {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  generateRefreshTokenHash,
  generateSecureToken,
} from "@/lib/auth/jwt";

describe("JWT", () => {
  const payload = {
    userId: "user-001",
    tenantId: "t-001",
    role: "broker" as const,
    email: "test@example.com",
  };

  describe("generateTokenPair", () => {
    it("returns accessToken, refreshToken, and expiresIn", () => {
      const tokens = generateTokenPair(payload);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(900); // 15 minutes
      expect(tokens.accessToken.split(".")).toHaveLength(3);
      expect(tokens.refreshToken.split(".")).toHaveLength(3);
    });

    it("generates different tokens for different users", () => {
      const tokens1 = generateTokenPair(payload);
      const tokens2 = generateTokenPair({ ...payload, userId: "user-002" });

      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });

  describe("verifyAccessToken", () => {
    it("returns payload for valid token", () => {
      const tokens = generateTokenPair(payload);
      const decoded = verifyAccessToken(tokens.accessToken);

      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe(payload.userId);
      expect(decoded!.tenantId).toBe(payload.tenantId);
      expect(decoded!.role).toBe(payload.role);
      expect(decoded!.email).toBe(payload.email);
    });

    it("returns null for invalid token", () => {
      expect(verifyAccessToken("invalid.token.here")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(verifyAccessToken("")).toBeNull();
    });

    it("returns null for tampered token", () => {
      const tokens = generateTokenPair(payload);
      // Flip last character
      const tampered = tokens.accessToken.slice(0, -1) + (tokens.accessToken.endsWith("A") ? "B" : "A");
      expect(verifyAccessToken(tampered)).toBeNull();
    });

    it("returns null for expired token", () => {
      // Mock Date to be 20 minutes in the future
      const now = Date.now();
      const tokens = generateTokenPair(payload);

      vi.spyOn(Date, "now").mockReturnValue(now + 20 * 60 * 1000);
      expect(verifyAccessToken(tokens.accessToken)).toBeNull();
      vi.restoreAllMocks();
    });

    it("returns valid payload within expiry window", () => {
      const now = Date.now();
      const tokens = generateTokenPair(payload);

      // 10 minutes later — should still be valid (15 min expiry)
      vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60 * 1000);
      expect(verifyAccessToken(tokens.accessToken)).not.toBeNull();
      vi.restoreAllMocks();
    });
  });

  describe("verifyRefreshToken", () => {
    it("returns userId and tenantId for valid refresh token", () => {
      const tokens = generateTokenPair(payload);
      const decoded = verifyRefreshToken(tokens.refreshToken);

      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe(payload.userId);
      expect(decoded!.tenantId).toBe(payload.tenantId);
    });

    it("returns null for an access token used as refresh token", () => {
      const tokens = generateTokenPair(payload);
      // Access token uses a different secret — should fail refresh verification
      expect(verifyRefreshToken(tokens.accessToken)).toBeNull();
    });

    it("returns null for invalid input", () => {
      expect(verifyRefreshToken("garbage")).toBeNull();
    });
  });

  describe("generateRefreshTokenHash", () => {
    it("produces a 64-char hex string", () => {
      const hash = generateRefreshTokenHash("some-token");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces consistent hashes for the same input", () => {
      const hash1 = generateRefreshTokenHash("token-abc");
      const hash2 = generateRefreshTokenHash("token-abc");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = generateRefreshTokenHash("token-1");
      const hash2 = generateRefreshTokenHash("token-2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("generateSecureToken", () => {
    it("produces a 64-char hex string", () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces unique tokens on each call", () => {
      const t1 = generateSecureToken();
      const t2 = generateSecureToken();
      expect(t1).not.toBe(t2);
    });
  });
});

describe("token uniqueness", () => {
  it("issues different tokens even for the same user in the same second", () => {
    const payload = { userId: "u1", tenantId: "t1", role: "broker" as const, email: "a@b.com" };
    const a = generateTokenPair(payload);
    const b = generateTokenPair(payload);
    expect(a.accessToken).not.toBe(b.accessToken);
    expect(a.refreshToken).not.toBe(b.refreshToken);
    expect(generateRefreshTokenHash(a.refreshToken)).not.toBe(generateRefreshTokenHash(b.refreshToken));
  });
});
