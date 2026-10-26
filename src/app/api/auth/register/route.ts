// src/app/api/auth/register/route.ts

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { registerSchema } from "@/lib/validation/auth.schema";
import { hashPassword } from "@/lib/auth/password";
import { generateTokenPair } from "@/lib/auth/jwt";
import { createSession } from "@/lib/auth/session";
import { apiSuccess, apiError, getClientIp, rateLimit } from "@/lib/auth/middleware";
import type { UserRole, AuthUser } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(ip, 3, 60_000);
  if (!limit.allowed) {
    return apiError("Too many registration attempts. Try again later.", 429);
  }

  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const { firstName, lastName, email, phone, password, role, tenantSlug } = parsed.data;

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      return apiError("An account with this email already exists", 409);
    }

    // Find or create tenant
    let tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      // For the prototype, auto-create tenants
      tenant = await prisma.tenant.create({
        data: {
          name: tenantSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          slug: tenantSlug,
          plan: "FREE",
          isActive: true,
        },
      });

      // Create default tenant settings
      await prisma.tenantSettings.create({
        data: {
          tenantId: tenant.id,
          riskWeights: {
            titleClarity: 0.30,
            legalExposure: 0.25,
            documentAuthenticity: 0.20,
            ownershipStability: 0.15,
            newsSentiment: 0.10,
          },
          maxUsers: 10,
          maxProperties: 100,
          defaultCurrency: "INR",
          timezone: "Asia/Kolkata",
        },
      });
    }

    // Check tenant user limit
    const tenantSettings = await prisma.tenantSettings.findUnique({
      where: { tenantId: tenant.id },
    });

    if (tenantSettings) {
      const userCount = await prisma.user.count({
        where: { tenantId: tenant.id, isActive: true },
      });

      if (userCount >= tenantSettings.maxUsers) {
        return apiError("This organization has reached its user limit", 403);
      }
    }

    // Find role
    const roleRecord = await prisma.role.findUnique({
      where: { name: role },
    });

    if (!roleRecord) {
      return apiError("Invalid role selected", 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        roleId: roleRecord.id,
        email,
        phone: phone || null,
        passwordHash,
        firstName,
        lastName,
        isActive: true,
        lastLoginAt: new Date(),
      },
      include: { role: true },
    });

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user.id,
      tenantId: tenant.id,
      role: role as UserRole,
      email: user.email,
    });

    // Create session
    await createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const authUser: AuthUser = {
      id: user.id,
      tenantId: tenant.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: role as UserRole,
      avatarUrl: null,
      isActive: true,
      mfaEnabled: false,
      emailVerifiedAt: null,
      lastLoginAt: new Date(),
      createdAt: user.createdAt,
    };

    return apiSuccess({ user: authUser, tokens }, 201);
  } catch (error) {
    console.error("Registration error:", error);
    return apiError("An unexpected error occurred", 500);
  }
}
