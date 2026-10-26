// src/app/api/admin/users/[id]/route.ts

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { updateUserStatus, updateUserRole } from "@/modules/admin/admin.service";
import { recordAudit } from "@/lib/audit";

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request, { requiredRole: "admin" });
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const body = await request.json();
    if (id === auth.userId && body.isActive === false) return apiError("You can't deactivate your own account", 400);
    if (body.isActive !== undefined) await updateUserStatus(auth.tenantId, id, !!body.isActive);
    if (body.role) await updateUserRole(auth.tenantId, id, body.role);
    await recordAudit({ tenantId: auth.tenantId, userId: auth.userId, action: "user.update", resourceType: "user", resourceId: id, metadata: { isActive: body.isActive, role: body.role } }, request);
    return apiSuccess({ message: "User updated" });
  } catch (error: any) {
    return apiError(error.message, 400);
  }
}
