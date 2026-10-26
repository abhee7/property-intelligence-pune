"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Scale,
  Search,
  Building,
  ChevronRight,
  X,
} from "lucide-react";

export default function CourtCasesPage() {
  const { getAccessToken } = useAuth();
  const [cases, setCases] = useState<any[]>([
    {
      id: "case-1",
      caseNumber: "CS-2025/881",
      courtName: "Pune Civil Court (Senior Division)",
      caseType: "Title Dispute & Ownership Clearance",
      caseStatus: "ACTIVE",
      title: "Deshmukh vs Patil Title Dispute",
      description: "Civil litigation over ancestral land rights on Hinjewadi Survey #299.",
      filingDate: "2025-11-10",
      nextHearingDate: "2026-08-25",
      parties: [
        { partyName: "Sunil Deshmukh", partyRole: "PLAINTIFF", advocateName: "Adv. Kulkarni" },
        { partyName: "Amit Patil", partyRole: "DEFENDANT", advocateName: "Adv. Shinde" },
      ],
      links: [
        { property: { id: "prop-002", title: "Survey 118, Hinjewadi", surveyNumber: "S.No.299/12" } },
      ],
    },
    {
      id: "case-2",
      caseNumber: "LAA-2024/104",
      courtName: "Bombay High Court (Bench Pune)",
      caseType: "Land Acquisition Compensation",
      caseStatus: "ACTIVE",
      title: "MIDC Ring Road Compensation Appeal",
      description: "High court stay order petition regarding MIDC industrial road widening.",
      filingDate: "2024-05-18",
      nextHearingDate: "2026-09-12",
      parties: [
        { partyName: "Ganesh Shinde", partyRole: "PETITIONER", advocateName: "Adv. Joshi" },
        { partyName: "MIDC Maharashtra", partyRole: "RESPONDENT", advocateName: "Govt Pleader" },
      ],
      links: [
        { property: { id: "prop-005", title: "Gala 3, Wagholi MIDC", surveyNumber: "73/15" } },
      ],
    },
    {
      id: "case-3",
      caseNumber: "REV-2023/419",
      courtName: "Revenue Sub-Divisional Officer (Haveli)",
      caseType: "7/12 Mutation Dispute",
      caseStatus: "DISPOSED",
      title: "Ferfar / Mutation Entry Challenge",
      description: "Disposed revenue appeal validating the heirship mutation entries.",
      filingDate: "2023-09-01",
      nextHearingDate: null,
      parties: [
        { partyName: "Vitthal Pawar", partyRole: "APPLICANT", advocateName: "Adv. Pawar" },
      ],
      links: [
        { property: { id: "prop-004", title: "Farm Plot, Mulshi", surveyNumber: "118/2A" } },
      ],
    },
  ]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  useEffect(() => {
    async function fetchCases() {
      try {
        const token = getAccessToken();
        const res = await fetch("/api/court-cases", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && data.data?.cases?.length > 0) {
          setCases(data.data.cases);
        }
      } catch (err) {
        console.error("Fetch court cases error:", err);
      }
    }

    fetchCases();
  }, [getAccessToken]);

  const filteredCases = cases.filter((c) => {
    if (search && !c.caseNumber?.toLowerCase().includes(search.toLowerCase()) && !c.title?.toLowerCase().includes(search.toLowerCase()) && !c.courtName?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter !== "ALL" && c.caseStatus !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight flex items-center gap-2">
            <Scale className="w-6 h-6 text-platinum/70" />
            Legal &amp; Court Case Intelligence
          </h1>
          <p className="text-xs text-platinum/45 mt-1">
            Litigation search, court hearings, stay orders, and land title disputes
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
            placeholder="Search by case #, party name, or court..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
          />
        </div>

        <div className="pi-input w-full sm:w-52 rounded-xl">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs bg-transparent text-platinum focus:outline-none rounded-xl"
          >
            <option className="bg-[#14151B] text-platinum" value="ALL">All Case Statuses</option>
            <option className="bg-[#14151B] text-platinum" value="ACTIVE">Active Litigation</option>
            <option className="bg-[#14151B] text-platinum" value="DISPOSED">Disposed / Closed</option>
            <option className="bg-[#14151B] text-platinum" value="PENDING">Pending Hearing</option>
          </select>
        </div>
      </div>

      {/* Court Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredCases.map((c) => (
          <div
            key={c.id}
            className="pi-card pi-card-interactive p-6 space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-extrabold text-xs text-platinum/80 bg-white/[0.06] border border-white/[0.1] px-2.5 py-1 rounded-lg">
                  {c.caseNumber}
                </span>
                <StatusBadge status={c.caseStatus} size="sm" />
              </div>

              <div>
                <h3 className="font-sora font-bold text-base text-platinum">
                  {c.title}
                </h3>
                <p className="text-xs text-platinum/45 flex items-center gap-1 mt-1">
                  <Building className="w-3.5 h-3.5 text-platinum/35" />
                  {c.courtName}
                </p>
              </div>

              <div className="pi-surface p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-platinum/40">Case Type:</span>
                  <span className="font-semibold text-platinum">{c.caseType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-platinum/40">Next Hearing:</span>
                  <span className={`font-mono font-bold ${c.nextHearingDate ? "text-rose-400" : "text-platinum/40"}`}>
                    {c.nextHearingDate || "None scheduled"}
                  </span>
                </div>
              </div>

              {c.links?.length > 0 && (
                <div className="text-xs">
                  <span className="text-platinum/40 font-medium block mb-1">Linked Property:</span>
                  {c.links.map((l: any, idx: number) => (
                    <Link
                      key={idx}
                      href={`/properties/${l.property?.id || "prop-001"}`}
                      className="inline-flex items-center gap-1 font-bold text-platinum/80 hover:text-platinum hover:underline underline-offset-2 transition-colors"
                    >
                      {l.property?.title} (S.# {l.property?.surveyNumber})
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedCase(c)}
              className="pi-btn-ghost w-full py-2 rounded-xl text-xs font-bold text-platinum flex items-center justify-center gap-1"
            >
              Inspect Case Parties &amp; Details <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Case Details Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="pi-glass w-full max-w-lg p-6 rounded-3xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-platinum/70" />
                <span className="font-sora font-bold text-sm text-platinum">
                  Case Record Details
                </span>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="pi-icon-btn p-1 rounded-lg text-platinum/40"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-platinum/40 block font-medium">Case Number</span>
                <span className="font-mono font-extrabold text-platinum text-sm">{selectedCase.caseNumber}</span>
              </div>
              <div>
                <span className="text-platinum/40 block font-medium">Title &amp; Court</span>
                <p className="font-bold text-platinum">{selectedCase.title}</p>
                <p className="text-platinum/50">{selectedCase.courtName}</p>
              </div>

              <div>
                <span className="text-platinum/40 block font-medium mb-1">Litigation Parties</span>
                <div className="space-y-2">
                  {selectedCase.parties?.map((p: any, idx: number) => (
                    <div key={idx} className="pi-surface p-2.5 flex justify-between">
                      <div>
                        <span className="font-bold text-platinum">{p.partyName}</span>
                        <span className="text-[10px] text-platinum/40 block">{p.advocateName || "Self"}</span>
                      </div>
                      <span className="font-bold text-platinum/60 uppercase text-[10px]">{p.partyRole}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex justify-end">
              <button
                onClick={() => setSelectedCase(null)}
                className="pi-btn-ghost px-4 py-2 rounded-xl text-platinum font-bold text-xs"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
