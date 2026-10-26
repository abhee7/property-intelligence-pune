// src/app/api/documents/[id]/route.ts

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { getDocumentById, deleteDocument, triggerOcr } from "@/modules/documents/document.service";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const document = await getDocumentById(auth.tenantId, id);
    if (!document) return apiError("Document not found", 404);
    return apiSuccess({ document });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch document", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "documents", action: "delete" },
  });
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    await deleteDocument(auth.tenantId, id);
    return apiSuccess({ message: "Document deleted" });
  } catch (error: any) {
    if (error.message === "Document not found") return apiError(error.message, 404);
    return apiError(error.message || "Failed to delete document", 500);
  }
}

// PATCH /api/documents/:id — trigger OCR
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const body = await request.json();
    if (body.action === "trigger_ocr") {
      await triggerOcr(auth.tenantId, id);
      return apiSuccess({ message: "OCR processing started" });
    }
    return apiError("Unknown action", 400);
  } catch (error: any) {
    if (error.message === "Document not found") return apiError(error.message, 404);
    // e.g. "OCR is already running…" / "doesn't need OCR" are user-facing, not server faults
    return apiError(error.message || "Action failed", error.message?.includes("OCR") ? 409 : 500);
  }
}
