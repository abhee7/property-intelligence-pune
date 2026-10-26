import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const sentiment = searchParams.get("sentiment") || "";

    const where: any = { tenantId: auth.tenantId };
    if (sentiment && sentiment !== "ALL") {
      where.sentiment = sentiment;
    }
    if (q) {
      where.article = {
        OR: [
          { headline: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    const mentions = await prisma.newspaperPropertyMention.findMany({
      where,
      include: {
        article: {
          include: {
            source: true,
          },
        },
        property: {
          select: { id: true, title: true, surveyNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({ mentions, total: mentions.length });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch news intelligence", 500);
  }
}
