// src/app/api/auth/me/route.ts

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import type { UserRole, AuthUser } from "@/lib/auth/types";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { role: true, tenant: true },
    });

    if (!user || !user.isActive) {
      return apiError("Account not found", 404);
    }

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
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };

    return apiSuccess({
      user: authUser,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
      },
    });
  } catch (error) {
    console.error("Me error:", error);
    return apiError("An unexpected error occurred", 500);
  }
}
