// src/app/api/documents/route.ts
// POST /api/documents — multipart upload
// GET  /api/documents — list with filters

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { uploadDocument, searchDocuments } from "@/modules/documents/document.service";
import { documentSearchSchema, validateFileType, validateFileSize, MAX_FILES_PER_UPLOAD } from "@/lib/validation/document.schema";
import type { UploadedFile } from "@/modules/documents/document.service";

export async function POST(request: NextRequest) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "documents", action: "create" },
  });
  if (auth instanceof Response) return auth;

  try {
    const formData = await request.formData();
    const propertyId = formData.get("propertyId") as string;
    const documentTypeId = formData.get("documentTypeId") as string;
    const files = formData.getAll("files") as File[];

    if (!propertyId) return apiError("Property ID is required", 400);
    if (!documentTypeId) return apiError("Document type is required", 400);
    if (!files.length) return apiError("No files provided", 400);
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return apiError(`Maximum ${MAX_FILES_PER_UPLOAD} files per upload`, 400);
    }

    const results = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        // Validate
        if (!validateFileType(file.type)) {
          errors.push(`${file.name}: unsupported file type (${file.type})`);
          continue;
        }
        if (!validateFileSize(file.size)) {
          errors.push(`${file.name}: exceeds 25 MB limit`);
          continue;
        }

        // Convert to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const uploadedFile: UploadedFile = {
          buffer,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
        };

        const doc = await uploadDocument(
          auth.tenantId,
          auth.userId,
          propertyId,
          documentTypeId,
          uploadedFile,
        );

        results.push(doc);
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    return apiSuccess({
      uploaded: results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: files.length,
        successful: results.length,
        failed: errors.length,
      },
    }, results.length > 0 ? 201 : 400);
  } catch (error: any) {
    console.error("Document upload error:", error);
    return apiError(error.message || "Upload failed", 500);
  }
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = documentSearchSchema.safeParse(params);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const result = await searchDocuments(auth.tenantId, parsed.data);

    return apiSuccess({
      documents: result.documents,
      total: result.total,
    });
  } catch (error: any) {
    console.error("Document search error:", error);
    return apiError(error.message || "Failed to fetch documents", 500);
  }
}
