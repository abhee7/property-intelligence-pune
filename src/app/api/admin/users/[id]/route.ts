// src/app/api/admin/users/[id]/route.ts

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { updateUserStatus, updateUserRole } from "@/modules/admin/admin.service";

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request, { requiredRole: "admin" });
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const body = await request.json();
    if (body.isActive !== undefined) await updateUserStatus(id, body.isActive);
    if (body.role) await updateUserRole(id, body.role);
    return apiSuccess({ message: "User updated" });
  } catch (error: any) {
    return apiError(error.message, 400);
  }
}
