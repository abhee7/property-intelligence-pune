import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const documents = await prisma.document.findMany({
      where: { propertyId: id, deletedAt: null },
      include: {
        documentType: { select: { name: true, requiresOcr: true } },
        uploader: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const docTypes = await prisma.documentType.findMany();
    const uploadedTypeIds = new Set(documents.map((d: any) => d.documentTypeId));
    const completeness = docTypes
      .filter((t: any) => t.isMandatory)
      .map((t: any) => ({ name: t.name, uploaded: uploadedTypeIds.has(t.id) }));

    return apiSuccess({
      documents: documents.map((d: any) => ({
        id: d.id,
        originalName: d.originalName,
        mimeType: d.mimeType,
        fileSizeBytes: d.fileSizeBytes,
        ocrStatus: d.ocrStatus,
        checksumSha256: d.checksumSha256,
        documentType: d.documentType.name,
        uploader: `${d.uploader.firstName} ${d.uploader.lastName}`,
        createdAt: d.createdAt,
      })),
      totalDocuments: documents.length,
      completeness,
      completenessPercent: completeness.length > 0
        ? Math.round((completeness.filter((c: any) => c.uploaded).length / completeness.length) * 100)
        : 100,
    });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch documents", 500);
  }
}
