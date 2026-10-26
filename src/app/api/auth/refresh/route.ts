// src/app/api/auth/refresh/route.ts

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyRefreshToken, generateTokenPair } from "@/lib/auth/jwt";
import { validateSession, revokeSessionByToken, createSession } from "@/lib/auth/session";
import { apiSuccess, apiError, getClientIp } from "@/lib/auth/middleware";
import type { UserRole } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return apiError("Refresh token is required", 400);
    }

    // Verify the refresh token cryptographically
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return apiError("Invalid or expired refresh token", 401);
    }

    // Validate session exists in database
    const session = await validateSession(refreshToken);
    if (!session.valid) {
      return apiError("Session expired or revoked", 401);
    }

    // Get user with role
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      return apiError("Account not found or deactivated", 401);
    }

    // Revoke old session (token rotation — old refresh token is now dead)
    await revokeSessionByToken(refreshToken);

    // Generate new token pair
    const tokens = generateTokenPair({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role.name as UserRole,
      email: user.email,
    });

    // Create new session with new refresh token
    const ip = getClientIp(request);
    await createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return apiSuccess({ tokens });
  } catch (error) {
    console.error("Refresh error:", error);
    return apiError("An unexpected error occurred", 500);
  }
}
