// GET /api/documents/types — document types for the upload form (real DB ids)

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { getDocumentTypes } from "@/modules/documents/document.service";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    return apiSuccess({ types: await getDocumentTypes() });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch document types", 500);
  }
}
