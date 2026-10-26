// src/app/api/notifications/route.ts
// GET  /api/notifications — list user's notifications
// POST /api/notifications — send a notification

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { sendNotification, getUserNotifications, markAllAsRead, getNotificationStats, broadcastNotification } from "@/modules/notifications/notification.service";
import { sendNotificationSchema, notificationSearchSchema } from "@/lib/validation/notification.schema";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);

    // Stats-only request
    if (params.stats === "true") {
      const stats = await getNotificationStats(auth.userId);
      return apiSuccess({ stats });
    }

    // Mark all read
    if (params.markAllRead === "true") {
      const count = await markAllAsRead(auth.userId);
      return apiSuccess({ markedRead: count });
    }

    const parsed = notificationSearchSchema.safeParse(params);
    if (!parsed.success) return apiError(parsed.error.errors[0].message, 400);

    const result = await getUserNotifications(auth.userId, parsed.data);
    return apiSuccess(result);
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch notifications", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();

    // Template-based broadcast
    if (body.eventType && body.variables) {
      const results = await broadcastNotification(
        auth.tenantId,
        body.recipientId || auth.userId,
        body.eventType,
        body.variables,
        body.priority || "normal",
      );
      return apiSuccess({ dispatched: results.length, results });
    }

    // Direct send
    const parsed = sendNotificationSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.errors[0].message, 400);

    const result = await sendNotification(
      auth.tenantId,
      parsed.data.recipientId,
      parsed.data.channel,
      parsed.data.subject || null,
      parsed.data.body,
      parsed.data.priority,
      parsed.data.metadata,
    );

    return apiSuccess(result, 201);
  } catch (error: any) {
    return apiError(error.message || "Failed to send notification", 500);
  }
}
