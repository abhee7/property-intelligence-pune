// src/app/api/notifications/[id]/route.ts

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { markAsRead } from "@/modules/notifications/notification.service";

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    await markAsRead(id, auth.userId);
    return apiSuccess({ message: "Marked as read" });
  } catch (error: any) {
    return apiError(error.message || "Failed to update notification", 500);
  }
}
