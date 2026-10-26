// src/lib/validation/document.schema.ts

import { z } from "zod";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
] as const;

export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp"];

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_UPLOAD = 10;

export const DOCUMENT_TYPES = [
  { id: "dt-title-deed", name: "Title deed", requiresOcr: true, isMandatory: true },
  { id: "dt-7-12-extract", name: "7/12 extract", requiresOcr: true, isMandatory: true },
  { id: "dt-encumbrance-cert", name: "Encumbrance certificate", requiresOcr: true, isMandatory: true },
  { id: "dt-tax-receipt", name: "Property tax receipt", requiresOcr: true, isMandatory: false },
  { id: "dt-sale-deed", name: "Sale deed", requiresOcr: true, isMandatory: false },
  { id: "dt-mutation-entry", name: "Mutation entry", requiresOcr: true, isMandatory: false },
  { id: "dt-na-order", name: "NA order", requiresOcr: true, isMandatory: false },
  { id: "dt-site-photo", name: "Site photographs", requiresOcr: false, isMandatory: false },
  { id: "dt-map-survey", name: "Map / Survey plan", requiresOcr: false, isMandatory: false },
  { id: "dt-other", name: "Other document", requiresOcr: false, isMandatory: false },
] as const;

export const uploadDocumentSchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
  documentTypeId: z.string().min(1, "Document type is required"),
});

export const documentSearchSchema = z.object({
  propertyId: z.string().optional(),
  documentTypeId: z.string().optional(),
  ocrStatus: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REQUIRES_REVIEW"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type DocumentSearchInput = z.infer<typeof documentSearchSchema>;

export function validateFileType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function validateFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_FILE_SIZE;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf(".")).toLowerCase();
}
