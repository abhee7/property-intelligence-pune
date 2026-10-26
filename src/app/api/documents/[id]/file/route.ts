// GET /api/documents/:id/file — streams the original uploaded file (tenant-checked)

import { NextRequest, NextResponse } from "next/server";
import { authenticate, apiError } from "@/lib/auth/middleware";
import { getDocumentById } from "@/modules/documents/document.service";
import { getStorageProvider } from "@/lib/storage/storage";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const document = await getDocumentById(auth.tenantId, id);
    if (!document) return apiError("Document not found", 404);

    const buffer = await getStorageProvider().read(document.fileUrl);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.originalName)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: any) {
    if (error?.code === "ENOENT") return apiError("File is missing from storage", 404);
    return apiError(error.message || "Failed to read file", 500);
  }
}
