// src/modules/documents/document.service.ts

import { prisma } from "@/lib/db/client";
import { getStorageProvider } from "@/lib/storage/storage";
import { validateFileType, validateFileSize } from "@/lib/validation/document.schema";
import type { DocumentSearchInput } from "@/lib/validation/document.schema";
import { enqueueOcr, recoverStuckOcrJobs, type StoredExtraction } from "./ocr/ocr.service";
import { scheduleRiskRecompute } from "@/modules/risk/risk.service";

// ─── Types ───

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface DocumentRecord {
  id: string;
  propertyId: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  ocrStatus: string;
  ocrConfidence: number | null;
  ocrError: string | null;
  ocrText?: string | null; // detail view only
  extracted: StoredExtraction | null;
  checksumSha256: string;
  documentType: { id: string; name: string; requiresOcr: boolean };
  uploader: { id: string; firstName: string; lastName: string };
  property?: { id: string; title: string; surveyNumber: string | null };
  processedAt: Date | null;
  createdAt: Date;
}

const DOC_INCLUDE = {
  documentType: { select: { id: true, name: true, slug: true, requiresOcr: true } },
  uploader: { select: { id: true, firstName: true, lastName: true } },
  property: { select: { id: true, title: true, surveyNumber: true, tenantId: true } },
} as const;

/** Turns a raw Prisma row into the API shape: parses extractedData, hides tenantId, drops OCR text unless asked. */
function toRecord(row: any, withText = false): DocumentRecord {
  let extracted: StoredExtraction | null = null;
  try {
    const parsed = JSON.parse(row.extractedData || "{}");
    if (parsed && parsed.fields) extracted = parsed;
  } catch {}

  const { extractedData: _raw, ocrText, property, ...rest } = row; // raw JSON replaced by the parsed `extracted`
  return {
    ...rest,
    fileSizeBytes: Number(row.fileSizeBytes),
    extracted,
    ...(withText ? { ocrText } : {}),
    ...(property ? { property: { id: property.id, title: property.title, surveyNumber: property.surveyNumber } } : {}),
  } as DocumentRecord;
}

export async function getDocumentTypes() {
  return prisma.documentType.findMany({ orderBy: { name: "asc" } });
}


// ─── Service ───

export async function uploadDocument(
  tenantId: string,
  userId: string,
  propertyId: string,
  documentTypeId: string,
  file: UploadedFile,
): Promise<DocumentRecord> {
  // Validate file
  if (!validateFileType(file.mimeType)) {
    throw new Error(`File type ${file.mimeType} is not allowed. Accepted: PDF, JPEG, PNG, TIFF, WebP`);
  }
  if (!validateFileSize(file.size)) {
    throw new Error("File exceeds the 25 MB size limit");
  }

  // Verify property exists and belongs to tenant
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId, deletedAt: null },
  });
  if (!property) throw new Error("Property not found");

  // Verify document type exists
  const docType = await prisma.documentType.findUnique({
    where: { id: documentTypeId },
  });
  if (!docType) throw new Error("Invalid document type");

  // Upload to storage
  const storage = getStorageProvider();
  const result = await storage.upload(file.buffer, file.originalName, file.mimeType);

  // Check for duplicate by checksum
  const existing = await prisma.document.findFirst({
    where: { propertyId, checksumSha256: result.checksum, deletedAt: null },
  });
  if (existing) {
    // Delete the just-uploaded file since it's a duplicate
    await storage.delete(result.fileUrl);
    throw new Error(`This exact file has already been uploaded (${existing.originalName})`);
  }

  // Create database record
  const document = await prisma.document.create({
    data: {
      propertyId,
      uploadedBy: userId,
      documentTypeId,
      originalName: file.originalName,
      fileUrl: result.fileUrl,
      mimeType: file.mimeType,
      fileSizeBytes: result.sizeBytes,
      ocrStatus: docType.requiresOcr ? "PENDING" : "COMPLETED",
      checksumSha256: result.checksum,
    },
    include: DOC_INCLUDE,
  });

  // Runs in the background — the upload response doesn't wait for OCR
  if (docType.requiresOcr) enqueueOcr(document.id);
  scheduleRiskRecompute(tenantId, propertyId); // checklist completeness just changed

  return toRecord(document);
}

export async function getDocumentsByProperty(
  tenantId: string,
  propertyId: string,
): Promise<DocumentRecord[]> {
  // Verify property belongs to tenant
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId, deletedAt: null },
  });
  if (!property) throw new Error("Property not found");

  const documents = await prisma.document.findMany({
    where: { propertyId, deletedAt: null },
    include: DOC_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return documents.map((d: any) => toRecord(d));
}

export async function searchDocuments(
  tenantId: string,
  input: DocumentSearchInput,
): Promise<{ documents: DocumentRecord[]; total: number }> {
  const where: Record<string, any> = { deletedAt: null, property: { tenantId } };

  void recoverStuckOcrJobs();

  if (input.propertyId) {
    where.propertyId = input.propertyId;
    // Verify tenant access
    const property = await prisma.property.findFirst({
      where: { id: input.propertyId, tenantId, deletedAt: null },
    });
    if (!property) throw new Error("Property not found");
  }
  if (input.documentTypeId) where.documentTypeId = input.documentTypeId;
  if (input.ocrStatus) where.ocrStatus = input.ocrStatus;

  const skip = (input.page - 1) * input.limit;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: DOC_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.limit,
    }),
    prisma.document.count({ where }),
  ]);

  return { documents: documents.map((d: any) => toRecord(d)), total };
}

export async function getDocumentById(
  tenantId: string,
  id: string,
): Promise<DocumentRecord | null> {
  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: DOC_INCLUDE,
  });

  if (!document) return null;
  if (document.property.tenantId !== tenantId) return null;

  return toRecord(document, true);
}

export async function deleteDocument(tenantId: string, id: string): Promise<void> {
  const document = await getDocumentById(tenantId, id);
  if (!document) throw new Error("Document not found");

  // Soft delete in database
  await prisma.document.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // Delete from storage
  const storage = getStorageProvider();
  await storage.delete(document.fileUrl);

  scheduleRiskRecompute(tenantId, document.propertyId);
}

export async function triggerOcr(tenantId: string, documentId: string): Promise<void> {
  const document = await getDocumentById(tenantId, documentId);
  if (!document) throw new Error("Document not found");

  if (!document.documentType.requiresOcr) throw new Error("This document type doesn't need OCR");
  if (document.ocrStatus === "PROCESSING") throw new Error("OCR is already running for this document");

  await prisma.document.update({
    where: { id: documentId },
    data: { ocrStatus: "PENDING", ocrError: null },
  });
  enqueueOcr(documentId);
}

export async function getPropertyDocumentCompleteness(
  tenantId: string,
  propertyId: string,
): Promise<{
  total: number;
  uploaded: number;
  mandatory: { name: string; uploaded: boolean }[];
  completeness: number;
}> {
  const allTypes = await prisma.documentType.findMany();
  const uploaded = await prisma.document.findMany({
    where: { propertyId, deletedAt: null },
    select: { documentTypeId: true },
  });

  const uploadedTypeIds = new Set(uploaded.map((d: any) => d.documentTypeId));
  const mandatory = allTypes
    .filter((t: any) => t.isMandatory)
    .map((t: any) => ({ name: t.name, uploaded: uploadedTypeIds.has(t.id) }));

  const mandatoryUploaded = mandatory.filter((m: any) => m.uploaded).length;

  return {
    total: allTypes.length,
    uploaded: uploaded.length,
    mandatory,
    completeness: mandatory.length > 0 ? Math.round((mandatoryUploaded / mandatory.length) * 100) : 100,
  };
}
