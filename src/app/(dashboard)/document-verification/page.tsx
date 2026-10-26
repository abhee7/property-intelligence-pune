"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-provider";
import { CHART_STATUS } from "@/lib/chart-theme";
import {
  FileCheck,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Search,
  Eye,
  Loader2,
  FileUp,
  RefreshCw,
  X,
  ScanText,
  Sparkles,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

// ─── Types ───

interface FieldCheck {
  field: string;
  label: string;
  extracted: string | number | null;
  recorded: string | number | null;
  score: number | null;
  status: "match" | "partial" | "mismatch" | "unverifiable" | "missing";
  note?: string;
  transliteration?: { spellings: string[]; engine: "rules" | "claude" };
}

interface DocRow {
  id: string;
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  ocrStatus: string;
  ocrConfidence: number | null;
  ocrError: string | null;
  ocrText?: string | null;
  createdAt: string;
  processedAt: string | null;
  documentType: { id: string; name: string };
  property?: { id: string; title: string; surveyNumber: string | null };
  extracted: null | {
    kind: string;
    detectedKind: string;
    fields: Record<string, string | number>;
    found: string[];
    expected: string[];
    completeness: number;
    verification: {
      overall: "verified" | "discrepancies" | "insufficient_data";
      checks: FieldCheck[];
      kindMismatch?: { uploadedAs: string; looksLike: string };
    };
    ocr: {
      method: string;
      pages: number;
      languages: string;
      durationMs: number;
      confidence: number;
      ai?: {
        used: boolean;
        model?: string;
        legibility?: string;
        illegibleParts?: string[];
        tesseractConfidence?: number;
        tesseractCompleteness?: number;
        claudeCompleteness?: number;
        error?: string;
      };
    };
  };
}

const FIELD_LABELS: Record<string, string> = {
  surveyNumber: "Survey number",
  ownerName: "Owner / seller",
  buyerName: "Buyer",
  village: "Village",
  taluka: "Taluka",
  district: "District",
  areaSqft: "Area (sq ft)",
  areaText: "Area as written",
  documentDate: "Document date",
  registrationNumber: "Registration no.",
  amount: "Amount (₹)",
};

const KIND_LABELS: Record<string, string> = {
  seven_twelve: "7/12 extract",
  title_deed: "Title deed",
  sale_deed: "Sale deed",
  encumbrance: "Encumbrance certificate",
  tax_receipt: "Property tax receipt",
  mutation: "Mutation entry",
  unknown: "Unknown",
};

const OCR_STATUS: Record<string, { label: string; bg: string; text: string; pulse?: boolean }> = {
  COMPLETED: { label: "Completed", bg: "bg-emerald-500/12", text: "text-emerald-400" },
  REQUIRES_REVIEW: { label: "Needs review", bg: "bg-amber-500/12", text: "text-amber-400" },
  PENDING: { label: "Queued", bg: "bg-white/[0.06]", text: "text-platinum/55", pulse: true },
  PROCESSING: { label: "Scanning…", bg: "bg-sky-500/12", text: "text-sky-400", pulse: true },
  FAILED: { label: "Failed", bg: "bg-rose-500/12", text: "text-rose-400" },
};

const CHECK_STYLE: Record<FieldCheck["status"], { label: string; cls: string }> = {
  match: { label: "Match", cls: "bg-emerald-500/12 text-emerald-400" },
  partial: { label: "Partial", cls: "bg-amber-500/12 text-amber-400" },
  mismatch: { label: "Mismatch", cls: "bg-rose-500/12 text-rose-400" },
  unverifiable: { label: "Can't compare", cls: "bg-white/[0.06] text-platinum/55" },
  missing: { label: "Not found", cls: "bg-white/[0.06] text-platinum/55" },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatValue(field: string, v: string | number | null) {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "amount" && typeof v === "number") return `₹${v.toLocaleString("en-IN")}`;
  if (field === "areaSqft" && typeof v === "number") return `${v.toLocaleString("en-IN")} sq ft`;
  return String(v);
}

// ─── Page ───

export default function DocumentVerificationPage() {
  const { getAccessToken } = useAuth();

  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [properties, setProperties] = useState<{ id: string; title: string; surveyNumber: string | null }[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [propertyId, setPropertyId] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [typeId, setTypeId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [selected, setSelected] = useState<DocRow | null>(null);
  const [showText, setShowText] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const token = getAccessToken();
      return fetch(url, {
        ...init,
        headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    },
    [getAccessToken],
  );

  const loadDocuments = useCallback(async () => {
    try {
      // the API returns at most 50 per page — fetch them all so search covers every document
      const all: DocRow[] = [];
      let total = Infinity;
      for (let page = 1; all.length < total && page <= 40; page++) {
        const json = await authFetch(`/api/documents?limit=50&page=${page}`).then((r) => r.json());
        if (!json.success) break;
        all.push(...json.data.documents);
        total = json.data.total;
        if (json.data.documents.length === 0) break;
      }
      setDocuments(all);
    } catch (err) {
      console.error("Fetch documents error:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  // Initial load: documents, document types, properties
  useEffect(() => {
    loadDocuments();
    (async () => {
      try {
        // the API caps a page at 100 properties — fetch them all so any property can be chosen
        const loadAllProperties = async () => {
          const all: any[] = [];
          let page = 1;
          let totalPages = 1;
          do {
            const json = await authFetch(`/api/properties?limit=100&page=${page}`).then((r) => r.json());
            if (!json.success) return { success: false, data: { properties: all } };
            all.push(...json.data.properties);
            totalPages = json.data.pagination?.totalPages ?? 1;
            page++;
          } while (page <= totalPages);
          return { success: true, data: { properties: all } };
        };
        const [t, p] = await Promise.all([authFetch("/api/documents/types").then((r) => r.json()), loadAllProperties()]);
        if (t.success) {
          setTypes(t.data.types);
          setTypeId((cur) => cur || t.data.types.find((x: any) => /7\/12/.test(x.name))?.id || t.data.types[0]?.id || "");
        }
        if (p.success) setProperties(p.data.properties);
      } catch (err) {
        console.error("Load form data error:", err);
      }
    })();
  }, [authFetch, loadDocuments]);

  // Poll while anything is still being scanned
  const busy = documents.some((d) => d.ocrStatus === "PENDING" || d.ocrStatus === "PROCESSING");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(loadDocuments, 2500);
    return () => clearInterval(t);
  }, [busy, loadDocuments]);

  // Keep the open drawer in sync with the latest list data (status, results)
  useEffect(() => {
    if (!selected) return;
    const fresh = documents.find((d) => d.id === selected.id);
    if (fresh && (fresh.ocrStatus !== selected.ocrStatus || fresh.processedAt !== selected.processedAt)) {
      openDetails(fresh.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  async function openDetails(id: string) {
    setShowText(false);
    try {
      const res = await authFetch(`/api/documents/${id}`);
      const json = await res.json();
      if (json.success) setSelected(json.data.document);
    } catch (err) {
      console.error("Fetch document error:", err);
    }
  }

  async function handleUpload() {
    if (!propertyId) return setMessage({ kind: "err", text: "Choose the property this document belongs to." });
    if (!typeId) return setMessage({ kind: "err", text: "Choose a document type." });
    if (!files.length) return setMessage({ kind: "err", text: "Select at least one file." });

    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("propertyId", propertyId);
      form.append("documentTypeId", typeId);
      files.forEach((f) => form.append("files", f));

      const res = await authFetch("/api/documents", { method: "POST", body: form });
      const json = await res.json();
      const errors: string[] = json.data?.errors || [];

      if (json.success && json.data.uploaded.length > 0) {
        setMessage({
          kind: errors.length ? "err" : "ok",
          text:
            `${json.data.uploaded.length} file(s) uploaded — OCR is running in the background.` +
            (errors.length ? ` Skipped: ${errors.join("; ")}` : ""),
        });
        setFiles([]);
        if (fileInput.current) fileInput.current.value = "";
        await loadDocuments();
      } else {
        setMessage({ kind: "err", text: errors.join("; ") || json.error || "Upload failed." });
      }
    } catch (err: any) {
      setMessage({ kind: "err", text: err.message || "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function rerunOcr(id: string) {
    const res = await authFetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger_ocr" }),
    });
    const json = await res.json();
    if (!json.success) setMessage({ kind: "err", text: json.error || "Couldn't start OCR." });
    await loadDocuments();
  }

  async function openOriginal(id: string) {
    const res = await authFetch(`/api/documents/${id}/file`);
    if (!res.ok) return setMessage({ kind: "err", text: "Couldn't open the original file." });
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const filteredProperties = properties.filter((p) => {
    // the chosen property always stays selectable
    if (p.id === propertyId) return true;
    const q = propertyFilter.trim().toLowerCase();
    return !q || p.title.toLowerCase().includes(q) || (p.surveyNumber ?? "").toLowerCase().includes(q);
  });

  const filteredDocs = documents.filter((d) => {
    const q = search.toLowerCase();
    if (q && !d.originalName.toLowerCase().includes(q) && !d.property?.title?.toLowerCase().includes(q)) return false;
    if (statusFilter !== "All" && d.ocrStatus !== statusFilter) return false;
    return true;
  });

  const stats = {
    total: documents.length,
    done: documents.filter((d) => d.ocrStatus === "COMPLETED").length,
    review: documents.filter((d) => d.ocrStatus === "REQUIRES_REVIEW" || d.extracted?.verification.overall === "discrepancies").length,
    failed: documents.filter((d) => d.ocrStatus === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-sora text-2xl font-extrabold text-platinum tracking-tight flex items-center gap-2.5">
          <span className="pi-icon-tile w-9 h-9 text-platinum/80">
            <FileCheck className="w-5 h-5" />
          </span>
          Document Verification &amp; OCR Intelligence
        </h1>
        <p className="text-xs text-platinum/45 mt-1">
          Upload 7/12 extracts, deeds and receipts — text is read with OCR, key fields are extracted and checked against the property record
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Documents", value: stats.total, color: "text-platinum" },
          { label: "OCR completed", value: stats.done, color: "text-emerald-400" },
          { label: "Need attention", value: stats.review, color: "text-amber-400" },
          { label: "Failed", value: stats.failed, color: "text-rose-400" },
        ].map((s) => (
          <div key={s.label} className="pi-card p-4">
            <div className="text-[11px] text-platinum/45 font-semibold">{s.label}</div>
            <div className={`font-sora text-2xl font-extrabold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div className="pi-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="pi-icon-tile w-10 h-10 text-platinum/80">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-sora text-sm font-bold text-platinum">Upload documents for OCR scanning</h3>
            <p className="text-xs text-platinum/45">PDF, JPG, PNG, TIFF or WebP · up to 25 MB each · English &amp; Marathi</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <input
              type="text"
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              placeholder={`Find among ${properties.length} properties (name, society, survey no.)…`}
              className="pi-input w-full px-3 py-2 text-xs rounded-xl bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
            />
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="pi-input w-full px-3 py-2.5 text-xs rounded-xl bg-transparent text-platinum focus:outline-none [&>option]:bg-[#14151b]"
            >
              <option value="">
                {filteredProperties.length === 0 ? "No property matches" : `Select property… (${filteredProperties.length}${filteredProperties.length > 60 ? ", showing 60" : ""})`}
              </option>
              {filteredProperties.slice(0, 60).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.surveyNumber ? ` — ${p.surveyNumber}` : ""}
                </option>
              ))}
            </select>
          </div>

          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="pi-input px-3 py-2.5 text-xs rounded-xl bg-transparent text-platinum focus:outline-none [&>option]:bg-[#14151b]"
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <label className="pi-input px-3 py-2.5 text-xs rounded-xl text-platinum/70 cursor-pointer flex items-center gap-2 truncate">
            <Upload className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">
              {files.length ? files.map((f) => f.name).join(", ") : "Choose file(s)…"}
            </span>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="pi-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sora font-bold text-xs disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanText className="w-4 h-4" />}
            Upload &amp; scan
          </button>
          {message && (
            <p className={`text-xs font-semibold flex items-center gap-1 ${message.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
              {message.kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {message.text}
            </p>
          )}
        </div>
      </div>

      {/* Directory */}
      <div className="pi-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <h3 className="font-sora text-base font-bold text-platinum">Document records</h3>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="pi-input relative flex-1 sm:w-64 rounded-xl flex items-center">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-platinum/35 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search document or property..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-transparent text-platinum placeholder-platinum/30 focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pi-input px-3 py-2 text-xs rounded-xl bg-transparent text-platinum focus:outline-none [&>option]:bg-[#14151b]"
            >
              <option value="All">All statuses</option>
              {Object.entries(OCR_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="pi-table w-full text-left text-xs">
            <thead>
              <tr>
                <th>File</th>
                <th>Property</th>
                <th>OCR</th>
                <th>Confidence</th>
                <th>Verification</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center text-platinum/45 py-8">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading documents…
                  </td>
                </tr>
              )}
              {!loading && filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-platinum/45 py-8">
                    {documents.length === 0 ? "No documents yet — upload one above to try the OCR." : "No documents match your filters."}
                  </td>
                </tr>
              )}
              {filteredDocs.map((doc) => {
                const s = OCR_STATUS[doc.ocrStatus] || OCR_STATUS.PENDING;
                const v = doc.extracted?.verification;
                return (
                  <tr key={doc.id} onClick={() => openDetails(doc.id)} className="cursor-pointer">
                    <td className="font-bold text-platinum">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-platinum/40 flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate max-w-[220px]" title={doc.originalName}>
                            {doc.originalName}
                          </span>
                          <span className="block text-[10px] font-medium text-platinum/45">
                            {doc.documentType?.name} · {new Date(doc.createdAt).toLocaleDateString("en-IN")}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      {doc.property && (
                        <Link href={`/properties/${doc.property.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-platinum/75 hover:text-platinum hover:underline">
                          {doc.property.title}
                        </Link>
                      )}
                    </td>
                    <td>
                      <span className={`pi-pill ${s.bg} ${s.text} border-transparent normal-case font-bold text-[10px] uppercase ${s.pulse ? "pi-pulse-dot" : ""}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="font-mono text-platinum/70">
                      {doc.ocrConfidence != null && doc.ocrStatus !== "PROCESSING" ? `${Math.round(doc.ocrConfidence)}%` : "—"}
                    </td>
                    <td>
                      {v ? (
                        <span
                          className={`pi-pill border-transparent normal-case font-bold text-[10px] uppercase ${
                            v.overall === "verified"
                              ? "bg-emerald-500/12 text-emerald-400"
                              : v.overall === "discrepancies"
                                ? "bg-rose-500/12 text-rose-400"
                                : "bg-white/[0.06] text-platinum/55"
                          }`}
                        >
                          {v.overall === "verified" ? "Verified" : v.overall === "discrepancies" ? "Discrepancies" : "Not enough data"}
                        </span>
                      ) : (
                        <span className="text-platinum/30">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetails(doc.id);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-platinum/75 hover:text-platinum font-bold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelected(null)} />
          <aside className="relative w-full max-w-xl h-full overflow-y-auto bg-[#14151b] border-l border-white/10 p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-sora text-lg font-extrabold text-platinum truncate">{selected.originalName}</h2>
                <p className="text-xs text-platinum/45">
                  {selected.documentType?.name} · {formatSize(selected.fileSizeBytes)}
                  {selected.property && ` · ${selected.property.title}`}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-platinum/45 hover:text-platinum p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => openOriginal(selected.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-platinum/80">
                <ExternalLink className="w-3.5 h-3.5" /> Open original
              </button>
              <button
                onClick={() => rerunOcr(selected.id)}
                disabled={selected.ocrStatus === "PROCESSING"}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-platinum/80 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-run OCR
              </button>
            </div>

            {/* Status */}
            {(selected.ocrStatus === "PENDING" || selected.ocrStatus === "PROCESSING") && (
              <div className="pi-card p-4 flex items-center gap-3 text-sm text-platinum/70">
                <Loader2 className="w-4 h-4 animate-spin" /> OCR in progress — this page updates automatically.
              </div>
            )}
            {selected.ocrStatus === "FAILED" && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {selected.ocrError || "OCR failed."}
              </div>
            )}

            {selected.extracted && (
              <>
                {/* OCR summary */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { l: "OCR confidence", v: `${Math.round(selected.extracted.ocr.confidence)}%` },
                    { l: "Fields found", v: `${selected.extracted.found.length}/${selected.extracted.expected.length}` },
                    { l: "Read via", v: selected.extracted.ocr.method.replace("-", " ") },
                  ].map((x) => (
                    <div key={x.l} className="pi-card p-3">
                      <div className="text-[10px] text-platinum/45 font-semibold">{x.l}</div>
                      <div className="font-sora font-extrabold text-platinum text-sm mt-1">{x.v}</div>
                    </div>
                  ))}
                </div>

                {selected.extracted.ocr.ai && (
                  <div
                    className={`rounded-xl border p-3 text-xs flex gap-2 ${
                      selected.extracted.ocr.ai.used ? "border-violet-500/30 bg-violet-500/10 text-violet-200" : "border-white/10 bg-white/[0.04] text-platinum/60"
                    }`}
                  >
                    <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      {selected.extracted.ocr.ai.error ? (
                        <p>Claude couldn&apos;t re-read this scan ({selected.extracted.ocr.ai.error.slice(0, 90)}), so the standard OCR reading is shown.</p>
                      ) : selected.extracted.ocr.ai.used ? (
                        <p>
                          <b>Read by Claude.</b> The standard OCR was unsure ({selected.extracted.ocr.ai.tesseractConfidence}% confidence,{" "}
                          {Math.round((selected.extracted.ocr.ai.tesseractCompleteness ?? 0) * 100)}% of expected fields), so Claude transcribed the scan
                          (legibility: {selected.extracted.ocr.ai.legibility}). The fields below were extracted from that transcription.
                        </p>
                      ) : (
                        <p>
                          Claude also read this scan (legibility: {selected.extracted.ocr.ai.legibility}), but the standard OCR reading was kept because Claude&apos;s
                          was not clearly better.
                        </p>
                      )}
                      {!!selected.extracted.ocr.ai.illegibleParts?.length && <p className="text-platinum/50">Unreadable parts noted: {selected.extracted.ocr.ai.illegibleParts.join("; ")}</p>}
                    </div>
                  </div>
                )}

                {selected.extracted.verification.kindMismatch && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    Uploaded as <b>{KIND_LABELS[selected.extracted.verification.kindMismatch.uploadedAs]}</b>, but the text looks like a{" "}
                    <b>{KIND_LABELS[selected.extracted.verification.kindMismatch.looksLike]}</b>. Check you chose the right document type.
                  </div>
                )}

                {/* Verification */}
                <section className="space-y-2">
                  <h3 className="font-sora text-sm font-bold text-platinum flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Check against property record
                  </h3>
                  <div className="pi-card overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-platinum/45 text-left">
                          <th className="p-2.5">Field</th>
                          <th className="p-2.5">In document</th>
                          <th className="p-2.5">On record</th>
                          <th className="p-2.5">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.extracted.verification.checks.map((c) => {
                          const st = CHECK_STYLE[c.status];
                          return (
                            <tr key={c.field} className="border-t border-white/5" title={c.note}>
                              <td className="p-2.5 font-semibold text-platinum/80">{c.label}</td>
                              <td className="p-2.5 text-platinum">
                                {formatValue(c.field, c.extracted)}
                                {c.transliteration && (
                                  <div className="text-[10px] text-platinum/45 mt-0.5 font-normal">
                                    Read as {c.transliteration.spellings.slice(0, 3).join(" / ")}
                                    {c.transliteration.engine === "claude" ? " · spelled by Claude" : " · rule-based"}
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-platinum/60">{formatValue(c.field, c.recorded)}</td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* All extracted fields */}
                <section className="space-y-2">
                  <h3 className="font-sora text-sm font-bold text-platinum">Extracted fields</h3>
                  <div className="pi-card divide-y divide-white/5">
                    {Object.entries(selected.extracted.fields).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 px-3 py-2 text-xs">
                        <span className="text-platinum/45">{FIELD_LABELS[k] || k}</span>
                        <span className="font-semibold text-platinum text-right">{formatValue(k, v)}</span>
                      </div>
                    ))}
                    {Object.keys(selected.extracted.fields).length === 0 && (
                      <div className="px-3 py-3 text-xs text-platinum/45">No fields could be extracted from this text.</div>
                    )}
                  </div>
                </section>
              </>
            )}

            {/* Raw text */}
            {selected.ocrText && (
              <section className="space-y-2">
                <button onClick={() => setShowText((s) => !s)} className="text-xs font-bold text-platinum/60 hover:text-platinum underline">
                  {showText ? "Hide" : "Show"} raw OCR text
                </button>
                {showText && (
                  <pre className="pi-card p-3 text-[11px] leading-relaxed text-platinum/70 whitespace-pre-wrap max-h-80 overflow-y-auto">
                    {selected.ocrText}
                  </pre>
                )}
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
