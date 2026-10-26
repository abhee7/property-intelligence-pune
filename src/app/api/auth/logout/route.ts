// src/app/api/auth/logout/route.ts

import { NextRequest } from "next/server";
import { revokeSessionByToken } from "@/lib/auth/session";
import { apiSuccess, apiError, extractAuth } from "@/lib/auth/middleware";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (refreshToken) {
      await revokeSessionByToken(refreshToken);
    }

    return apiSuccess({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return apiError("An unexpected error occurred", 500);
  }
}
