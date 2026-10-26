// src/app/api/notifications/preferences/route.ts

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { updatePreferencesSchema } from "@/lib/validation/notification.schema";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: auth.userId },
    orderBy: { eventType: "asc" },
  });

  return apiSuccess({ preferences: prefs });
}

export async function PUT(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = updatePreferencesSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.errors[0].message, 400);

    for (const pref of parsed.data.preferences) {
      await prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId: auth.userId, eventType: pref.eventType } },
        update: {
          emailEnabled: pref.emailEnabled,
          whatsappEnabled: pref.whatsappEnabled,
          smsEnabled: pref.smsEnabled,
          inAppEnabled: pref.inAppEnabled,
        },
        create: {
          userId: auth.userId,
          eventType: pref.eventType,
          emailEnabled: pref.emailEnabled,
          whatsappEnabled: pref.whatsappEnabled,
          smsEnabled: pref.smsEnabled,
          inAppEnabled: pref.inAppEnabled,
        },
      });
    }

    return apiSuccess({ message: "Preferences updated" });
  } catch (error: any) {
    return apiError(error.message || "Failed to update preferences", 500);
  }
}
