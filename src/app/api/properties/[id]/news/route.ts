import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const mentions = await prisma.newspaperPropertyMention.findMany({
      where: { propertyId: id },
      include: {
        article: {
          include: {
            source: { select: { name: true } },
            entities: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({
      mentions: mentions.map((m: any) => ({
        relevanceScore: m.relevanceScore,
        sentiment: m.sentiment,
        sentimentScore: m.sentimentScore,
        matchType: m.matchType,
        matchedExcerpt: m.matchedExcerpt,
        article: {
          id: m.article.id,
          headline: m.article.headline,
          summary: m.article.summary,
          url: m.article.url,
          publishedAt: m.article.publishedAt,
          source: m.article.source.name,
          entities: m.article.entities,
        },
      })),
      totalMentions: mentions.length,
    });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch news data", 500);
  }
}
