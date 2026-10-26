// src/modules/documents/ocr/ocr.service.ts
//
// Orchestrates OCR for an uploaded document:
//   read file → extract text → extract fields → verify against the property record → save.
// Jobs run one at a time (OCR is CPU heavy) and never block the upload response.

import { prisma } from "@/lib/db/client";
import { getStorageProvider } from "@/lib/storage/storage";
import { extractText, type OcrResult } from "./ocr.engine";
import { getAiConfig } from "@/lib/ai/claude";
import { chooseReading, readDocumentWithClaude, shouldUseClaude } from "./claude.reader";
import { extractFields, kindFromSlug, type ExtractionResult } from "./field-extractor";
import { verifyAgainstProperty, transliterationNeeds, MIN_TRUSTED_CONFIDENCE, type VerificationResult } from "./verification";
import { resolveTransliterations } from "./transliteration";
import { matchSurveyNumber, matchVillage } from "@/modules/matching/matching.algorithms";
import { scheduleRiskRecompute } from "@/modules/risk/risk.service";

// ─── Types ───

export type { CheckStatus, FieldCheck, VerificationResult } from "./verification";

export interface StoredExtraction extends ExtractionResult {
  verification: VerificationResult;
  ocr: {
    method: string;
    pages: number;
    languages: string;
    durationMs: number;
    confidence: number;
    /** present when Claude was asked to read the scan (see claude.reader.ts) */
    ai?: {
      used: boolean; // true = the text below comes from Claude, false = Tesseract's text was kept
      model?: string;
      legibility?: string;
      language?: string;
      illegibleParts?: string[];
      tesseractConfidence?: number;
      tesseractCompleteness?: number;
      claudeCompleteness?: number;
      error?: string;
    };
  };
}

const OCR_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_CONFIDENCE_OK = MIN_TRUSTED_CONFIDENCE;
const MIN_COMPLETENESS_OK = 0.5;

// ─── Job queue (one at a time) ───

const g = globalThis as unknown as { __ocrQueue?: Promise<void>; __ocrRecovered?: boolean };

export function enqueueOcr(documentId: string): void {
  g.__ocrQueue = (g.__ocrQueue ?? Promise.resolve()).then(() =>
    processDocumentOcr(documentId).catch((err) => console.error(`[ocr] job ${documentId} crashed:`, err)),
  );
}

/** Resolves once every queued OCR job has finished (used by scripts that bulk-upload). */
export function waitForOcrIdle(): Promise<void> {
  return (g.__ocrQueue ?? Promise.resolve()).then(() => undefined);
}

/** After a server restart, anything stuck in PROCESSING/PENDING is picked up again (once per process). */
export async function recoverStuckOcrJobs(): Promise<void> {
  if (g.__ocrRecovered) return;
  g.__ocrRecovered = true;
  try {
    const stuck = await prisma.document.findMany({
      where: { deletedAt: null, ocrStatus: { in: ["PROCESSING", "PENDING"] }, documentType: { requiresOcr: true } },
      select: { id: true },
    });
    for (const d of stuck) enqueueOcr(d.id);
    if (stuck.length) console.log(`[ocr] re-queued ${stuck.length} unfinished document(s)`);
  } catch (err) {
    g.__ocrRecovered = false;
    console.error("[ocr] recovery failed:", err);
  }
}

// ─── Cross-check against the rest of the portfolio ───

/**
 * If the document's survey number doesn't fit its own property, does it fit another one?
 * That usually means it was uploaded to the wrong property — or two records overlap.
 */
async function findOtherPropertiesForDocument(
  tenantId: string,
  ownPropertyId: string,
  extracted: { surveyNumber?: string; village?: string },
  ownSurveyCheck: string | undefined,
): Promise<NonNullable<VerificationResult["possibleOtherProperties"]>> {
  if (!extracted.surveyNumber || ownSurveyCheck === "match") return [];

  const candidates = await prisma.property.findMany({
    where: { tenantId, deletedAt: null, id: { not: ownPropertyId }, surveyNumber: { not: null } },
    select: { id: true, title: true, surveyNumber: true, metadata: true },
  });

  const out: { id: string; title: string; surveyNumber: string | null; score: number }[] = [];
  for (const c of candidates) {
    const survey = matchSurveyNumber(extracted.surveyNumber, c.surveyNumber);
    if (survey < 0.85) continue;
    let village: string | undefined;
    try {
      village = JSON.parse(c.metadata || "{}").village;
    } catch {}
    // same survey number in a *different* village is a coincidence, not a match
    if (extracted.village && village && matchVillage(extracted.village, village) < 0.7) continue;
    out.push({ id: c.id, title: c.title, surveyNumber: c.surveyNumber, score: Math.round(survey * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ─── The job itself ───

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OCR timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function processDocumentOcr(documentId: string): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: {
      documentType: true,
      property: { include: { owner: true } },
    },
  });
  if (!doc) return;

  await prisma.document.update({ where: { id: documentId }, data: { ocrStatus: "PROCESSING", ocrError: null } });

  try {
    const storage = getStorageProvider();
    const buffer = await storage.read(doc.fileUrl);

    const uploadedKind = kindFromSlug(doc.documentType.slug);

    // 1. Tesseract first — free, local and fast
    let ocr: OcrResult = await withTimeout(extractText(buffer, doc.mimeType), OCR_TIMEOUT_MS);
    let text = ocr.text.trim();
    let extraction = extractFields(text, uploadedKind);
    let ai: NonNullable<StoredExtraction["ocr"]["ai"]> | undefined;

    // 2. Optionally ask Claude to read the scan when Tesseract isn't confident (AI_SCAN_READING)
    const aiCfg = getAiConfig();
    if (
      shouldUseClaude({
        mode: aiCfg.scanReading,
        configured: aiCfg.configured,
        tesseractConfidence: ocr.confidence,
        tesseractCompleteness: extraction.completeness,
        tesseractTextLength: text.length,
      })
    ) {
      const started = Date.now();
      try {
        const reading = await readDocumentWithClaude(buffer, doc.mimeType);
        const claudeExtraction = extractFields(reading.text, uploadedKind);
        const winner = chooseReading({
          tesseract: { confidence: ocr.confidence, completeness: extraction.completeness, textLength: text.length },
          claude: { legibility: reading.legibility, completeness: claudeExtraction.completeness, textLength: reading.text.length },
        });
        ai = {
          used: winner === "claude",
          model: reading.model,
          legibility: reading.legibility,
          language: reading.language,
          illegibleParts: reading.illegibleParts,
          tesseractConfidence: Math.round(ocr.confidence),
          tesseractCompleteness: Math.round(extraction.completeness * 100) / 100,
          claudeCompleteness: Math.round(claudeExtraction.completeness * 100) / 100,
        };
        if (winner === "claude") {
          ocr = {
            text: reading.text,
            confidence: reading.confidence,
            pages: reading.pages,
            method: "claude-vision",
            languages: `claude · ${reading.language}`,
            durationMs: ocr.durationMs + (Date.now() - started),
          };
          text = reading.text;
          extraction = claudeExtraction;
        }
      } catch (err: any) {
        // Never let an AI problem fail the document — keep Tesseract's reading and note why
        console.warn(`[ocr] Claude read skipped for ${documentId}: ${err?.message || err}`);
        ai = { used: false, error: String(err?.message || err).slice(0, 200) };
      }
    }

    if (text.replace(/\s/g, "").length < 15) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          ocrStatus: "FAILED",
          ocrText: text,
          ocrConfidence: ocr.confidence,
          ocrError: "No readable text found. Try a sharper, well-lit scan.",
          processedAt: new Date(),
        },
      });
      return;
    }

    let village: string | null = null;
    try {
      village = JSON.parse(doc.property.metadata || "{}").village ?? null;
    } catch {}

    const facts = {
      surveyNumber: doc.property.surveyNumber,
      areaSqft: doc.property.areaSqft,
      ownerName: doc.property.owner ? `${doc.property.owner.firstName} ${doc.property.owner.lastName}` : null,
      village,
    };

    // Marathi owner/village vs English record: ask Claude (cached) how those names are spelled in English.
    // Without a key — or if the call fails — the rule-based transliteration is used on its own.
    const translit = await resolveTransliterations(transliterationNeeds(extraction, facts));
    if (translit.error) console.warn(`[ocr] transliteration fell back to rules for ${documentId}: ${translit.error}`);

    const verification = verifyAgainstProperty(extraction, facts, uploadedKind, ocr.confidence, translit.spellings);

    const others = await findOtherPropertiesForDocument(
      doc.property.tenantId,
      doc.propertyId,
      extraction.fields,
      verification.checks.find((c) => c.field === "surveyNumber")?.status,
    );
    if (others.length) verification.possibleOtherProperties = others;

    const stored: StoredExtraction = {
      ...extraction,
      verification,
      ocr: {
        method: ocr.method,
        pages: ocr.pages,
        languages: ocr.languages,
        durationMs: ocr.durationMs,
        confidence: Math.round(ocr.confidence * 10) / 10,
        ...(ai ? { ai } : {}),
      },
    };

    const good = ocr.confidence >= MIN_CONFIDENCE_OK && extraction.completeness >= MIN_COMPLETENESS_OK;

    await prisma.document.update({
      where: { id: documentId },
      data: {
        ocrStatus: good ? "COMPLETED" : "REQUIRES_REVIEW",
        ocrText: text,
        ocrConfidence: ocr.confidence,
        extractedData: JSON.stringify(stored),
        ocrError: null,
        processedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error(`[ocr] document ${documentId} failed:`, err);
    await prisma.document.update({
      where: { id: documentId },
      data: { ocrStatus: "FAILED", ocrError: String(err?.message || err).slice(0, 500), processedAt: new Date() },
    });
  } finally {
    // Whatever happened, the property's document picture changed — refresh its risk score
    scheduleRiskRecompute(doc.property.tenantId, doc.propertyId);
  }
}
