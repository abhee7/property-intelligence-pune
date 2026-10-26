"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  Newspaper,
  Search,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Calendar,
} from "lucide-react";
import { CHART_STATUS } from "@/lib/chart-theme";

export default function NewsIntelligencePage() {
  const { getAccessToken } = useAuth();
  const [mentions, setMentions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("ALL");

  useEffect(() => {
    async function fetchNews() {
      try {
        const token = getAccessToken();
        const res = await fetch("/api/news-intelligence", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success) setMentions(data.data?.mentions ?? []);
        else setLoadError(data.error || "Couldn't load news mentions");
      } catch (err) {
        console.error("Fetch news error:", err);
        setLoadError("Couldn't load news mentions");
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, [getAccessToken]);

  const filteredMentions = mentions.filter((m) => {
    if (search && !m.article?.headline?.toLowerCase().includes(search.toLowerCase()) && !m.property?.title?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (sentimentFilter !== "ALL" && m.sentiment !== sentimentFilter) {
      return false;
    }
    return true;
  });

  // Sentiment -> platinum-glass status color mapping. POSITIVE/NEGATIVE map onto
  // the chart-theme's good/critical severity hues (positive news reads as a
  // "good" signal, risk-alert news reads as "critical"); NEUTRAL stays an
  // unaccented platinum tone rather than borrowing warning/serious, since
  // neutral coverage is not itself a caution signal.
  const sentimentStyles: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    POSITIVE: {
      bg: `${CHART_STATUS.good}1f`,
      text: CHART_STATUS.good,
      border: `${CHART_STATUS.good}40`,
      icon: <TrendingUp className="w-3 h-3" />,
    },
    NEGATIVE: {
      bg: `${CHART_STATUS.critical}1f`,
      text: CHART_STATUS.critical,
      border: `${CHART_STATUS.critical}40`,
      icon: <TrendingDown className="w-3 h-3" />,
    },
    NEUTRAL: {
      bg: "rgba(244,246,250,0.06)",
      text: "rgba(244,246,250,0.5)",
      border: "rgba(244,246,250,0.14)",
      icon: <Minus className="w-3 h-3" />,
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-platinum/70" />
            Media &amp; News Intelligence Tracker
          </h1>
          <p className="text-xs text-platinum/45 mt-1">
            Newspaper articles matched to properties by locality, with sentiment · prototype data set, no live crawling
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="pi-card p-4 flex flex-col sm:flex-row items-center gap-3">
        <div className="pi-input relative flex-1 w-full flex items-center rounded-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-platinum/35 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search headline or property mentioned..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
          />
        </div>

        <div className="pi-input w-full sm:w-52 rounded-xl">
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs bg-transparent text-platinum focus:outline-none rounded-xl"
          >
            <option className="bg-[#14151B] text-platinum" value="ALL">All Sentiments</option>
            <option className="bg-[#14151B] text-platinum" value="POSITIVE">Positive News</option>
            <option className="bg-[#14151B] text-platinum" value="NEGATIVE">Negative News / Risk Alert</option>
            <option className="bg-[#14151B] text-platinum" value="NEUTRAL">Neutral / Informational</option>
          </select>
        </div>
      </div>

      {/* News Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(loading || loadError || filteredMentions.length === 0) && (
          <div className="pi-card p-8 text-center text-sm text-platinum/45">
            {loading ? "Loading…" : loadError || "No news mentions match."}
          </div>
        )}
        {filteredMentions.map((m) => {
          const sentiment = sentimentStyles[m.sentiment] || sentimentStyles.NEUTRAL;
          return (
            <div
              key={m.id}
              className="pi-card pi-card-interactive p-6 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/[0.08] text-platinum/70 border border-white/[0.14]">
                    {m.article?.source?.name || "News Source"}
                  </span>
                  <span
                    className="pi-pill uppercase text-[10px] px-2.5 py-0.5"
                    style={{ background: sentiment.bg, color: sentiment.text, borderColor: sentiment.border }}
                  >
                    {sentiment.icon}
                    {m.sentiment}
                  </span>
                </div>

                <div>
                  <h3 className="font-sora font-bold text-sm text-platinum line-clamp-2">
                    {m.article?.headline}
                  </h3>
                  <p className="text-[11px] text-platinum/40 mt-1 flex items-center gap-1 font-mono">
                    <Calendar className="w-3 h-3" />
                    Published: {m.article?.publishedAt?.split("T")[0]}
                  </p>
                </div>

                <div className="pi-surface p-3 text-xs text-platinum/60 leading-relaxed italic">
                  &ldquo;{m.matchedExcerpt}&rdquo;
                </div>

                <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs">
                  <span className="text-platinum/40 font-medium">Relevance:</span>
                  <span className="font-mono font-bold text-platinum">
                    {(m.relevanceScore * 100).toFixed(0)}% Match
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                <Link
                  href={`/properties/${m.property?.id || "prop-001"}`}
                  className="font-bold text-xs text-platinum/80 hover:text-platinum hover:underline underline-offset-2 flex items-center gap-1 transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  {m.property?.title}
                </Link>
                <a
                  href={m.article?.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="pi-icon-btn p-1.5 rounded-lg text-platinum/40"
                  title="View Source Article"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
