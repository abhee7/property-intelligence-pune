import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const links = await prisma.courtCasePropertyLink.findMany({
      where: { propertyId: id },
      include: {
        courtCase: {
          include: {
            parties: true,
            hearings: { orderBy: { hearingDate: "desc" }, take: 5 },
            orders: { orderBy: { orderDate: "desc" }, take: 5 },
          },
        },
      },
    });

    return apiSuccess({
      cases: links.map((link: any) => ({
        linkType: link.linkType,
        impactScore: link.impactScore,
        case: {
          id: link.courtCase.id,
          caseNumber: link.courtCase.caseNumber,
          courtName: link.courtCase.courtName,
          caseStatus: link.courtCase.caseStatus,
          title: link.courtCase.title,
          filingDate: link.courtCase.filingDate,
          nextHearingDate: link.courtCase.nextHearingDate,
          parties: link.courtCase.parties,
          hearings: link.courtCase.hearings,
          orders: link.courtCase.orders,
        },
      })),
      totalCases: links.length,
      hasStayOrder: links.some((l: any) => l.courtCase.orders.some((o: any) => o.isStayOrder)),
    });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch court cases", 500);
  }
}
