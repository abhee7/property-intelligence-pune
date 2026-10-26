// src/lib/auth/session.ts
//
// Database-backed session management
// Stores refresh token hashes (never plaintext) in user_sessions table
// Supports concurrent sessions per user with device tracking

import { prisma } from "@/lib/db/client";
import { generateRefreshTokenHash } from "./jwt";

interface CreateSessionInput {
  userId: string;
  refreshToken: string;
  ipAddress: string;
  userAgent: string | null;
  expiresAt: Date;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const tokenHash = generateRefreshTokenHash(input.refreshToken);

  const session = await prisma.userSession.create({
    data: {
      userId: input.userId,
      refreshTokenHash: tokenHash,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent || "Unknown",
      expiresAt: input.expiresAt,
    },
  });

  return session.id;
}

export async function validateSession(refreshToken: string): Promise<{
  valid: boolean;
  userId?: string;
  sessionId?: string;
}> {
  const tokenHash = generateRefreshTokenHash(refreshToken);

  const session = await prisma.userSession.findFirst({
    where: {
      refreshTokenHash: tokenHash,
      expiresAt: { gt: new Date() },
    },
  });

  if (!session) {
    return { valid: false };
  }

  return {
    valid: true,
    userId: session.userId,
    sessionId: session.id,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.userSession.delete({
    where: { id: sessionId },
  }).catch(() => {
    // Session may already be deleted — that's fine
  });
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.userSession.deleteMany({
    where: { userId },
  });
  return result.count;
}

export async function revokeSessionByToken(refreshToken: string): Promise<void> {
  const tokenHash = generateRefreshTokenHash(refreshToken);

  await prisma.userSession.deleteMany({
    where: { refreshTokenHash: tokenHash },
  });
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.userSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

export async function getUserActiveSessions(userId: string) {
  return prisma.userSession.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
