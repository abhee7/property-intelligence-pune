// src/app/api/admin/users/route.ts

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { listUsers, createUser } from "@/modules/admin/admin.service";

export async function GET(request: NextRequest) {
  const auth = authenticate(request, { requiredRole: "agency_admin" });
  if (auth instanceof Response) return auth;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const result = await listUsers(auth.tenantId, {
    role: params.role, isActive: params.isActive === "true" ? true : params.isActive === "false" ? false : undefined,
    q: params.q, page: params.page ? Number(params.page) : 1, limit: params.limit ? Number(params.limit) : 20,
  });

  return apiSuccess(result);
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request, { requiredRole: "admin" });
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const user = await createUser(auth.tenantId, body);
    return apiSuccess({ user }, 201);
  } catch (error: any) {
    return apiError(error.message, 400);
  }
}
