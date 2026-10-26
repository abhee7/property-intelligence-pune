// src/lib/auth/jwt.ts
//
// Zero-dependency JWT implementation using Node.js crypto
// No Auth0, no Clerk, no Firebase — runs entirely locally
// Production upgrade: swap for jose library + RSA keys

import { createHmac, randomBytes } from "crypto";
import type { AuthTokenPayload, TokenPair } from "./types";

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-in-production-min-32-chars";
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production-min-32-chars";
const ACCESS_TOKEN_TTL = 15 * 60;           // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

// ─── Base64url encoding (JWT-compliant) ───

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): string {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

// ─── HMAC-SHA256 signing ───

function sign(payload: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(payload).digest());
}

// ─── Token creation ───

function createToken(payload: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
    // Unique id: without it, two tokens issued for the same user in the same second are
    // byte-identical, so a refresh would "rotate" to the very same token (and hash).
    jti: randomBytes(8).toString("hex"),
  }));
  const signature = sign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

// ─── Token verification ───

function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expectedSig = sign(`${header}.${body}`, secret);

  // Constant-time comparison to prevent timing attacks
  if (sig.length !== expectedSig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const payload = JSON.parse(base64urlDecode(body));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Public API ───

export function generateTokenPair(payload: Omit<AuthTokenPayload, "iat" | "exp">): TokenPair {
  const accessToken = createToken(
    { userId: payload.userId, tenantId: payload.tenantId, role: payload.role, email: payload.email },
    ACCESS_TOKEN_SECRET,
    ACCESS_TOKEN_TTL,
  );

  const refreshToken = createToken(
    { userId: payload.userId, tenantId: payload.tenantId, type: "refresh" },
    REFRESH_TOKEN_SECRET,
    REFRESH_TOKEN_TTL,
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
  };
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  const payload = verifyToken(token, ACCESS_TOKEN_SECRET);
  if (!payload) return null;

  return {
    userId: payload.userId as string,
    tenantId: payload.tenantId as string,
    role: payload.role as AuthTokenPayload["role"],
    email: payload.email as string,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

export function verifyRefreshToken(token: string): { userId: string; tenantId: string } | null {
  const payload = verifyToken(token, REFRESH_TOKEN_SECRET);
  if (!payload || payload.type !== "refresh") return null;

  return {
    userId: payload.userId as string,
    tenantId: payload.tenantId as string,
  };
}

export function generateRefreshTokenHash(refreshToken: string): string {
  return createHmac("sha256", REFRESH_TOKEN_SECRET).update(refreshToken).digest("hex");
}

export function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}
