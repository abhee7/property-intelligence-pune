// src/app/api/auth/login/route.ts

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { loginSchema } from "@/lib/validation/auth.schema";
import { verifyPassword } from "@/lib/auth/password";
import { generateTokenPair } from "@/lib/auth/jwt";
import { createSession } from "@/lib/auth/session";
import { apiSuccess, apiError, getClientIp, rateLimit } from "@/lib/auth/middleware";
import type { UserRole, AuthUser } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  // Rate limiting: 5 attempts per minute per IP
  const ip = getClientIp(request);
  const limit = rateLimit(ip, 5, 60_000);
  if (!limit.allowed) {
    return apiError("Too many login attempts. Please try again later.", 429);
  }

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const { email, password } = parsed.data;

    // Find user with role
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: { role: true, tenant: true },
    });

    if (!user) {
      // Log failed attempt
      await prisma.loginAttempt.create({
        data: {
          email,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
          success: false,
          failureReason: "user_not_found",
        },
      });
      // Generic error to prevent user enumeration
      return apiError("Invalid email or password", 401);
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);

    if (!passwordValid) {
      await prisma.loginAttempt.create({
        data: {
          userId: user.id,
          email,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
          success: false,
          failureReason: "invalid_password",
        },
      });
      return apiError("Invalid email or password", 401);
    }

    // Check tenant is active
    if (!user.tenant.isActive) {
      return apiError("Your organization account has been deactivated", 403);
    }

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role.name as UserRole,
      email: user.email,
    });

    // Create session
    await createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log successful attempt
    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        email,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent"),
        success: true,
      },
    });

    // Build response user object
    const authUser: AuthUser = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name as UserRole,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      mfaEnabled: user.mfaEnabled,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: new Date(),
      createdAt: user.createdAt,
    };

    return apiSuccess({ user: authUser, tokens });
  } catch (error) {
    console.error("Login error:", error);
    return apiError("An unexpected error occurred", 500);
  }
}
