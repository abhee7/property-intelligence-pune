import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const status = searchParams.get("status") || "";
    const court = searchParams.get("court") || "";

    const where: any = { tenantId: auth.tenantId };
    if (status && status !== "ALL") {
      where.caseStatus = status;
    }
    if (court && court !== "ALL") {
      where.courtName = { contains: court, mode: "insensitive" };
    }
    if (q) {
      where.OR = [
        { caseNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { courtName: { contains: q, mode: "insensitive" } },
      ];
    }

    const cases = await prisma.courtCase.findMany({
      where,
      include: {
        parties: true,
        links: {
          include: {
            property: {
              select: { id: true, title: true, surveyNumber: true },
            },
          },
        },
        hearings: {
          orderBy: { hearingDate: "asc" },
          take: 3,
        },
        orders: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({ cases, total: cases.length });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch court cases", 500);
  }
}
