"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { RiskBadge } from "@/components/ui/risk-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Building2,
  MapPin,
  FileText,
  ShieldAlert,
  Scale,
  Newspaper,
  ArrowLeft,
  Calendar,
  User,
  DollarSign,
  Maximize2,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Loader2,
  Info,
  RefreshCw,
  GitMerge,
  Sparkles,
} from "lucide-react";

function formatPrice(n: number | null): string {
  if (!n) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatArea(n: number | null): string {
  if (!n) return "—";
  if (n >= 43560) return `${(n / 43560).toFixed(1)} acres`;
  return `${n.toLocaleString()} sq ft`;
}

export default function PropertyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const propertyId = resolvedParams.id;
  const router = useRouter();
  const { getAccessToken } = useAuth();

  const [activeTab, setActiveTab] = useState<"overview" | "risk" | "legal" | "documents" | "news">("overview");
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [recomputing, setRecomputing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchProperty = useCallback(async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/properties/${propertyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const result = await res.json();
      if (result.success && result.data?.property) {
        setProperty(result.data.property);
        setLoadError(null);
      } else {
        setProperty(null);
        setLoadError(result.error || "The property record could not be loaded.");
      }
    } catch (err: any) {
      console.error("Property fetch error:", err);
      setLoadError(err.message || "Network error while loading the property.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, getAccessToken]);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  async function recomputeRisk(withAi = false) {
    withAi ? setAiBusy(true) : setRecomputing(true);
    setAiMessage(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/properties/${propertyId}/risk${withAi ? "?ai=1" : ""}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (withAi) {
        const st = json.data?.narrativeStatus;
        if (!json.success) setAiMessage({ ok: false, text: json.error || "Couldn't generate the explanation." });
        else if (st?.source === "ai") setAiMessage({ ok: true, text: "Claude wrote a new summary from the evidence below." });
        else if (st?.source === "kept") setAiMessage({ ok: true, text: "The Claude summary is already up to date — nothing has changed since it was written." });
        else setAiMessage({ ok: false, text: st?.reason || "No AI summary was produced — the rule-based summary is shown." });
      }
      await fetchProperty();
    } finally {
      setRecomputing(false);
      setAiBusy(false);
    }
  }

  // ── Live court records (eCourtsIndia) ──
  const [courtBusy, setCourtBusy] = useState(false);
  const [courtLitigant, setCourtLitigant] = useState("");
  const [courtQuery, setCourtQuery] = useState("");
  const [courtResults, setCourtResults] = useState<any[] | null>(null);
  const [courtMessage, setCourtMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkingCnr, setLinkingCnr] = useState<string | null>(null);

  async function searchLiveCourts() {
    setCourtBusy(true);
    setCourtMessage(null);
    try {
      const token = getAccessToken();
      const qs = new URLSearchParams();
      if (courtLitigant.trim()) qs.set("litigant", courtLitigant.trim());
      if (courtQuery.trim()) qs.set("q", courtQuery.trim());
      const res = await fetch(`/api/properties/${propertyId}/court-search?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const json = await res.json();
      if (!json.success) {
        setCourtResults(null);
        setCourtMessage({ ok: false, text: json.error || "The court search failed." });
        return;
      }
      setCourtResults(json.data.cases);
      setCourtLitigant(json.data.terms.litigant ?? "");
      setCourtQuery(json.data.terms.query ?? "");
      if (!json.data.cases.length) setCourtMessage({ ok: true, text: "No matching cases were found in the live court records." });
    } catch (err: any) {
      setCourtMessage({ ok: false, text: err.message || "Network error." });
    } finally {
      setCourtBusy(false);
    }
  }

  async function linkLiveCase(cnr: string) {
    setLinkingCnr(cnr);
    setCourtMessage(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/properties/${propertyId}/court-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cnr }),
      });
      const json = await res.json();
      if (!json.success) {
        setCourtMessage({ ok: false, text: json.error || "Couldn't link that case." });
        return;
      }
      setCourtResults((rows) => rows?.map((r) => (r.cnr === cnr ? { ...r, linked: true } : r)) ?? null);
      setCourtMessage({ ok: true, text: "Case linked. The risk score will update in a moment." });
      setTimeout(fetchProperty, 1500);
    } finally {
      setLinkingCnr(null);
    }
  }

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center text-platinum/40 text-sm">
        <Loader2 className="w-6 h-6 animate-spin text-platinum/60 mr-2" />
        Loading property intelligence details...
      </div>
    );
  }

  if (!property) {
    return (
      <div className="pi-card p-8 text-center">
        <h2 className="font-sora text-lg font-bold text-platinum">Property Not Found</h2>
        <p className="text-xs text-platinum/45 mt-1 mb-4">{loadError || "The property record could not be loaded."}</p>
        <Link href="/properties" className="pi-btn-primary inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold">
          Return to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="pi-card p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              href="/properties"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-platinum/50 hover:text-platinum transition-colors mb-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Properties Directory
            </Link>
            <h1 className="font-sora text-2xl md:text-3xl font-extrabold text-platinum tracking-tight">
              {property.title}
            </h1>
            <p className="text-xs text-platinum/45 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-platinum/40" />
              {property.address?.line1 || "Main Road"}, {property.address?.city || "Pune"},{" "}
              {property.address?.state || "Maharashtra"}
              <span className="font-mono text-platinum/35">| Survey: {property.surveyNumber || "N/A"}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={property.status} />
            <RiskBadge
              level={property.riskScore?.riskLevel}
              score={property.riskScore?.overallScore}
            />
          </div>
        </div>

        {/* Quick Spec Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/[0.08] text-xs">
          <div className="pi-surface p-3">
            <span className="text-[10px] text-platinum/40 uppercase tracking-wider block font-bold">Estimated Price</span>
            <span className="font-sora text-base font-extrabold text-platinum">{formatPrice(property.price)}</span>
          </div>
          <div className="pi-surface p-3">
            <span className="text-[10px] text-platinum/40 uppercase tracking-wider block font-bold">Total Area</span>
            <span className="font-sora text-base font-extrabold text-platinum">{formatArea(property.areaSqft)}</span>
          </div>
          <div className="pi-surface p-3">
            <span className="text-[10px] text-platinum/40 uppercase tracking-wider block font-bold">Property Type</span>
            <span className="text-base font-bold text-platinum">{property.propertyType?.name || "Plot"}</span>
          </div>
          <div className="pi-surface p-3">
            <span className="text-[10px] text-platinum/40 uppercase tracking-wider block font-bold">Owner / Broker</span>
            <span className="text-base font-bold text-platinum">
              {property.owner ? `${property.owner.firstName} ${property.owner.lastName}` : "Direct Owner"}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-white/[0.08]">
        {[
          { id: "overview", label: "Overview & Specs", icon: Building2 },
          { id: "risk", label: "AI Risk Intelligence", icon: ShieldAlert },
          { id: "legal", label: "Legal & Court Cases", icon: Scale },
          { id: "documents", label: "Documents (7/12, Title)", icon: FileText },
          { id: "news", label: "News Intelligence", icon: Newspaper },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              activeTab === tab.id
                ? "bg-white/[0.1] text-platinum border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "bg-white/[0.02] text-platinum/50 hover:text-platinum/80 border-white/[0.08] hover:bg-white/[0.05]"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 pi-card p-6 space-y-6">
            <div>
              <h3 className="font-sora text-base font-bold text-platinum mb-2">Property Description</h3>
              <p className="text-xs text-platinum/55 leading-relaxed">
                {property.description || "Detailed land and property parcel record verified through Sahyadri intelligence portal."}
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/[0.08]">
              <h3 className="font-sora text-base font-bold text-platinum">Survey &amp; Revenue Details</h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-platinum/40 block font-medium">Survey Number</span>
                  <span className="font-mono font-bold text-platinum">{property.surveyNumber || "N/A"}</span>
                </div>
                <div>
                  <span className="text-platinum/40 block font-medium">Khasra Number</span>
                  <span className="font-mono font-bold text-platinum">{property.khasraNumber || "N/A"}</span>
                </div>
                <div>
                  <span className="text-platinum/40 block font-medium">Taluka</span>
                  <span className="font-bold text-platinum">{property.metadata?.taluka || "Haveli"}</span>
                </div>
                <div>
                  <span className="text-platinum/40 block font-medium">Village</span>
                  <span className="font-bold text-platinum">{property.metadata?.village || "Kharadi"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pi-card p-6 space-y-4">
            <h3 className="font-sora text-base font-bold text-platinum">Location Details</h3>
            <div className="pi-surface p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-platinum/40">District:</span>
                <span className="font-bold text-platinum">{property.address?.district || "Pune"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-platinum/40">State:</span>
                <span className="font-bold text-platinum">{property.address?.state || "Maharashtra"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-platinum/40">Pincode:</span>
                <span className="font-mono font-bold text-platinum">{property.address?.postalCode || "411001"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Risk Analysis */}
      {activeTab === "risk" && (
        <div className="space-y-6">
          <div className="pi-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                Risk Score Breakdown
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => recomputeRisk(true)}
                  disabled={aiBusy || recomputing}
                  title="Have Claude explain this score in plain English, using only the evidence below"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-xs font-bold text-violet-200 disabled:opacity-60"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${aiBusy ? "animate-pulse" : ""}`} />
                  {aiBusy ? "Asking Claude…" : "Explain with AI"}
                </button>
                <button
                  onClick={() => recomputeRisk(false)}
                  disabled={recomputing || aiBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-platinum/80 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${recomputing ? "animate-spin" : ""}`} />
                  {recomputing ? "Recalculating…" : "Recalculate"}
                </button>
                <RiskBadge level={property.riskScore?.riskLevel} score={property.riskScore?.overallScore} size="lg" />
              </div>
            </div>

            {!property.riskScore && (
              <div className="pi-surface p-6 text-center text-xs text-platinum/45">
                No risk score yet. Press Recalculate to score this property from its documents, court cases, news and matches.
              </div>
            )}

            {property.riskScore?.flags?.length > 0 && (
              <div className="space-y-2">
                {property.riskScore.flags.map((f: any) => (
                  <div
                    key={f.code}
                    className={`flex items-start gap-2 p-3 rounded-xl border text-xs font-medium ${
                      f.severity === "critical"
                        ? "bg-rose-500/10 border-rose-500/25 text-rose-300"
                        : f.severity === "high"
                          ? "bg-orange-500/10 border-orange-500/25 text-orange-300"
                          : "bg-amber-500/10 border-amber-500/25 text-amber-300"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
                    {f.message}
                  </div>
                ))}
              </div>
            )}

            {aiMessage && (
              <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs font-medium ${aiMessage.ok ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300" : "bg-amber-500/10 border-amber-500/25 text-amber-300"}`}>
                {aiMessage.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-px" /> : <Info className="w-4 h-4 flex-shrink-0 mt-px" />}
                {aiMessage.text}
              </div>
            )}

            {property.riskScore?.aiNarrative && (
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-platinum/70 text-xs leading-relaxed">
                <span className="font-bold flex items-center gap-2 text-platinum mb-1">
                  Summary
                  {property.riskScore.narrativeSource === "ai" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 text-[10px] font-bold" title="Every number in this text was checked against the report data">
                      <Sparkles className="w-3 h-3" /> Written by AI{property.riskScore.narrativeModel ? ` · ${property.riskScore.narrativeModel}` : ""}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-platinum/50 text-[10px] font-bold">Rule-based</span>
                  )}
                </span>
                <span className="whitespace-pre-line block">{property.riskScore.aiNarrative}</span>
                {property.riskScore.computedAt && (
                  <span className="block mt-2 text-[10px] text-platinum/35">
                    Calculated {new Date(property.riskScore.computedAt).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            )}

            {property.riskScore?.factors?.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-platinum/40">Scored Risk Factors</h4>
                {property.riskScore.factors.map((f: any, idx: number) => {
                  const color = f.factorScore >= 76 ? "#ef4444" : f.factorScore >= 56 ? "#f97316" : f.factorScore >= 36 ? "#f59e0b" : "#34d399";
                  return (
                    <div key={idx} className="pi-surface p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-platinum">
                          {f.factorDef?.name || "Risk Factor"}
                          <span className="ml-2 font-medium text-platinum/35">weight {Math.round((f.weight ?? 0) * 100)}%</span>
                        </span>
                        <span className="font-mono font-bold" style={{ color }}>
                          {f.factorScore}/100
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${f.factorScore}%`, background: color }} />
                      </div>
                      <p className="text-xs text-platinum/55">{f.explanation}</p>
                      {f.evidence?.length > 0 && (
                        <ul className="text-[11px] text-platinum/40 space-y-0.5 list-disc pl-4">
                          {f.evidence.map((e: string, i: number) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {property.matches?.length > 0 && (
            <div className="pi-card p-6 space-y-3">
              <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-violet-400" />
                Duplicate &amp; Conflict Candidates
              </h3>
              {property.matches.map((m: any) => (
                <Link
                  key={m.id}
                  href={`/properties/${m.other.id}`}
                  className="pi-surface p-3 flex items-center justify-between gap-3 text-xs hover:bg-white/[0.06]"
                >
                  <span className="min-w-0">
                    <span className="font-bold text-platinum block truncate">{m.other.title}</span>
                    <span className="text-platinum/40 font-mono">S.No. {m.other.surveyNumber ?? "—"}</span>
                  </span>
                  <span className="text-right flex-shrink-0">
                    <span className="font-bold text-platinum block">{m.overallScore}% · {String(m.matchType).replace(/_/g, " ")}</span>
                    <span className="text-platinum/40">{m.status}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Legal Intelligence */}
      {activeTab === "legal" && (
        <div className="pi-card p-6 space-y-4">
          <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
            <Scale className="w-5 h-5 text-violet-400" />
            Linked Court Cases &amp; Litigations
          </h3>

          {property.courtPropertyLinks?.length > 0 ? (
            <div className="space-y-4">
              {property.courtPropertyLinks.map((link: any) => (
                <div key={link.id} className="pi-surface p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-platinum">{link.courtCase?.title}</span>
                    <span className="pi-pill bg-rose-500/12 text-rose-400 border-rose-500/25 text-[10px] px-2 py-0.5">
                      Impact: {Math.round((link.impactScore ?? 0.5) * 100)}/100
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-platinum/45">
                    <div>Case #: <span className="font-mono font-bold text-platinum">{link.courtCase?.caseNumber}</span></div>
                    <div>Status: <span className="font-bold text-amber-400">{link.courtCase?.caseStatus}</span></div>
                    <div>Court: <span className="font-medium text-platinum/60">{link.courtCase?.courtName}</span></div>
                    {link.linkType && <div>Type: <span className="font-medium text-platinum/60">{String(link.linkType).replace(/_/g, " ")}</span></div>}
                    {link.courtCase?.nextHearingDate && (
                      <div>Next hearing: <span className="font-medium text-platinum/60">{new Date(link.courtCase.nextHearingDate).toLocaleDateString("en-IN")}</span></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pi-surface p-8 text-center text-platinum/45 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              No active court litigations linked to this survey number.
            </div>
          )}

          <div className="pi-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-sm text-platinum">Search live court records</p>
                <p className="text-[11px] text-platinum/45">
                  Looks in eCourtsIndia by the owner&apos;s name or a place. Results are suggestions — nothing is linked until you choose. Each search is billed by the provider (about ₹0.60), a linked case about ₹1.50.
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                value={courtLitigant}
                onChange={(e) => setCourtLitigant(e.target.value)}
                placeholder="Person involved in the case (leave empty to use the owner)"
                className="pi-input text-xs"
              />
              <input
                value={courtQuery}
                onChange={(e) => setCourtQuery(e.target.value)}
                placeholder="Or any text, e.g. a village or society name"
                className="pi-input text-xs"
              />
            </div>
            <button onClick={searchLiveCourts} disabled={courtBusy} className="pi-btn-primary text-xs px-3 py-2 inline-flex items-center gap-2 disabled:opacity-50">
              {courtBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
              {courtBusy ? "Searching…" : "Search eCourts"}
            </button>
            {courtMessage && <p className={`text-xs ${courtMessage.ok ? "text-emerald-400" : "text-rose-400"}`}>{courtMessage.text}</p>}
            {courtResults && courtResults.length > 0 && (
              <div className="divide-y divide-white/[0.06]">
                {courtResults.map((c: any) => (
                  <div key={c.cnr} className="py-3 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-1 min-w-0">
                      <p className="font-bold text-platinum">
                        {[c.petitioners?.[0], c.respondents?.[0]].filter(Boolean).join(" vs ") || c.caseNumber}
                      </p>
                      <p className="text-platinum/45">
                        {c.caseNumber} · {c.caseType || "case"} · <span className="text-amber-400 font-bold">{c.caseStatus}</span>
                      </p>
                      <p className="text-platinum/35 truncate">{c.courtName}</p>
                    </div>
                    {c.linked ? (
                      <span className="pi-pill bg-emerald-500/12 text-emerald-400 border-emerald-500/25 text-[10px] px-2 py-0.5 shrink-0">Linked</span>
                    ) : (
                      <button
                        onClick={() => linkLiveCase(c.cnr)}
                        disabled={linkingCnr === c.cnr}
                        className="pi-btn-ghost text-[11px] px-2.5 py-1.5 shrink-0 disabled:opacity-50"
                      >
                        {linkingCnr === c.cnr ? "Linking…" : "Link to this property"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Documents */}
      {activeTab === "documents" && (
        <div className="pi-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
              <FileText className="w-5 h-5 text-platinum/70" />
              Uploaded Property Documents
            </h3>
          </div>

          {!property.documents?.length && (
            <div className="pi-surface p-8 text-center text-platinum/45 text-xs">
              No documents uploaded yet.{" "}
              <Link href="/document-verification" className="underline text-platinum/70">Upload documents</Link> to verify this property.
            </div>
          )}

          <div className="divide-y divide-white/[0.06]">
            {property.documents?.map((doc: any) => (
              <div key={doc.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="pi-icon-tile w-8 h-8 text-platinum/70">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-platinum">{doc.originalName}</p>
                    <p className="text-[10px] text-platinum/35">{doc.documentType?.name || "Document"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {doc.ocrConfidence != null && <span className="font-mono text-platinum/45">{Math.round(doc.ocrConfidence)}%</span>}
                  {doc.verification && (
                    <span
                      className={`pi-pill text-[10px] px-2 py-0.5 ${
                        doc.verification === "verified"
                          ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/25"
                          : doc.verification === "discrepancies"
                            ? "bg-rose-500/12 text-rose-400 border-rose-500/25"
                            : "bg-white/[0.06] text-platinum/55 border-white/10"
                      }`}
                    >
                      {doc.verification === "verified" ? "Verified" : doc.verification === "discrepancies" ? "Discrepancies" : "Unclear"}
                    </span>
                  )}
                  <span
                    className={`pi-pill text-[10px] px-2 py-0.5 ${
                      doc.ocrStatus === "COMPLETED"
                        ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/25"
                        : doc.ocrStatus === "FAILED"
                          ? "bg-rose-500/12 text-rose-400 border-rose-500/25"
                          : "bg-amber-500/12 text-amber-400 border-amber-500/25"
                    }`}
                  >
                    {doc.ocrStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: News Intelligence */}
      {activeTab === "news" && (
        <div className="pi-card p-6 space-y-4">
          <h3 className="font-sora text-base font-bold text-platinum flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-amber-400" />
            Property Mentioned Newspaper Articles
          </h3>

          {property.newspaperMentions?.length > 0 ? (
            <div className="space-y-3">
              {property.newspaperMentions.map((n: any) => (
                <div key={n.id} className="pi-surface p-4 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-platinum">{n.article?.headline}</span>
                    <span className="text-[10px] font-bold text-platinum/35">{n.article?.source?.name || "News"}</span>
                  </div>
                  <p className="text-platinum/45">{n.matchedExcerpt}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="pi-surface p-8 text-center text-platinum/45 text-xs">
              No recent newspaper mentions detected for this property parcel.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
