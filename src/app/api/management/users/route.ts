import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "users", action: "read" },
  });
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") || "";
    const q = searchParams.get("q") || "";

    const where: any = { tenantId: auth.tenantId, deletedAt: null };
    if (role && role !== "ALL") {
      where.role = { name: role };
    }
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        role: { select: { id: true, name: true, displayName: true } },
        _count: {
          select: {
            ownedProperties: true,
            brokedProperties: true,
            documents: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({ users, total: users.length });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch users", 500);
  }
}
