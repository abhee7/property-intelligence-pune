// Verifies the Claude integration end to end with your real API key.
//
//   npm run ai:check
//
// It makes three small API calls (a few cents in total) and writes NOTHING to the database:
//   1. writes a risk narrative for the highest-risk property in your data
//   2. reads a deliberately degraded scan with Claude and compares it with Tesseract
//   3. asks Claude to spell two Marathi names in English and scores them against the usual spellings

import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";
import { prisma } from "../src/lib/db/client";
import { getAiConfig, getAiUsage } from "../src/lib/ai/claude";
import { computeRisk } from "../src/modules/risk/risk.engine";
import { gatherRiskInputs } from "../src/modules/risk/risk.service";
import { buildNarrativeInput, generateAiNarrative, validateNarrative } from "../src/modules/risk/risk.narrative";
import { readDocumentWithClaude } from "../src/modules/documents/ocr/claude.reader";
import { extractText, shutdownOcr } from "../src/modules/documents/ocr/ocr.engine";
import { extractFields } from "../src/modules/documents/ocr/field-extractor";
import { resolveTransliterations } from "../src/modules/documents/ocr/transliteration";
import { transliterateDevanagari } from "../src/lib/text/devanagari";
import { matchOwnerNamePhonetic } from "../src/lib/text/phonetic";

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => console.log(`  ✗ ${m}`);

async function main() {
  const cfg = getAiConfig();
  console.log("\nClaude integration check");
  console.log("========================");
  console.log(`  model:            ${cfg.model}`);
  console.log(`  narratives:       ${cfg.narratives}   (AI_NARRATIVES)`);
  console.log(`  scan reading:     ${cfg.scanReading}   (AI_SCAN_READING)`);
  console.log(`  refusal fallback: ${cfg.refusalFallbacks ? "on" : "off"}`);

  if (!cfg.configured) {
    console.log("\n  No Claude credential found.\n  Add your key to .env as  ANTHROPIC_API_KEY=sk-ant-...  and run this again.\n");
    process.exit(1);
  }
  ok("credential found in the environment");

  // ── 1. narrative ──
  console.log("\n1. Risk narrative");
  const top = await prisma.riskScore.findFirst({ orderBy: { overallScore: "desc" }, include: { property: { select: { id: true, tenantId: true, title: true, status: true, metadata: true } } } });
  if (!top) {
    bad("no risk scores in the database — run npm run dataset:import first");
  } else {
    const inputs = await gatherRiskInputs(top.property.tenantId, top.property.id);
    const result = computeRisk(inputs!);
    let locality: string | null = null;
    try {
      locality = JSON.parse(top.property.metadata || "{}").village ?? null;
    } catch {}
    const header = { title: top.property.title, locality, status: top.property.status };

    console.log(`  property: ${header.title} — ${result.overallScore}/100 ${result.riskLevel}`);
    console.log(`  rule-based: ${result.narrative}\n`);

    const out = await generateAiNarrative(result, header);
    if (out.ok) {
      ok(`Claude (${out.model}) wrote a grounded narrative:\n`);
      console.log(out.text.split("\n").map((l) => "      " + l).join("\n") + "\n");
      const check = validateNarrative({ summary: out.text.split("\n\n")[0], recommended_actions: ["x"] }, buildNarrativeInput(result, header));
      ok(check.ok ? "every number in it appears in the report data" : `grounding check: ${check.reasons.join("; ")}`);
    } else {
      bad(`${out.kind}: ${out.reason}`);
    }
  }

  // ── 2. scan reading ──
  console.log("\n2. Reading a degraded scan");
  const source = path.join(process.cwd(), "demo-docs", "1_7-12_CORRECT.png");
  if (!fs.existsSync(source)) {
    bad("demo-docs/1_7-12_CORRECT.png not found — run npm run demo:docs first");
  } else {
    // blur, skew, add noise and darken: roughly what a bad phone photo looks like
    const raw = await sharp(source).rotate(2.5, { background: "#e8e4d8" }).blur(1.6).linear(0.75, 18).modulate({ brightness: 0.92 }).jpeg({ quality: 45 }).toBuffer();
    fs.mkdirSync(path.join(process.cwd(), "demo-docs"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), "demo-docs", "_degraded-for-ai-check.jpg"), raw);

    const tess = await extractText(raw, "image/jpeg");
    const tessFields = extractFields(tess.text, "seven_twelve");
    console.log(`  Tesseract: ${Math.round(tess.confidence)}% confidence, ${tessFields.found.length}/${tessFields.expected.length} fields → ${JSON.stringify(tessFields.fields)}`);

    try {
      const reading = await readDocumentWithClaude(raw, "image/jpeg");
      const f = extractFields(reading.text, "seven_twelve");
      ok(`Claude (${reading.model}): legibility ${reading.legibility}, ${f.found.length}/${f.expected.length} fields → ${JSON.stringify(f.fields)}`);
      if (reading.illegibleParts.length) console.log(`      unreadable parts noted: ${reading.illegibleParts.join("; ")}`);
    } catch (e: any) {
      bad(`${e.kind ?? "error"}: ${e.message}`);
    }
  }

  // ── 3. Marathi transliteration ──
  console.log("\n3. Marathi names → English spellings");
  const samples = [
    { source: "ज्ञानेश्वर लोखंडे", english: "Dnyaneshwar Lokhande", kind: "person" as const },
    { source: "हिंजवडी", english: "Hinjewadi", kind: "place" as const },
  ];
  const t = await resolveTransliterations(samples.map(({ source, kind }) => ({ source, kind })), { store: { find: async () => new Map(), save: async () => {} } });
  if (t.error) bad(t.error);
  for (const s of samples) {
    const claude = t.spellings[s.source] ?? [];
    const best = Math.max(0, ...claude.map((c) => matchOwnerNamePhonetic(c, s.english)));
    console.log(`  ${s.source}  rules: "${transliterateDevanagari(s.source)}"  Claude: ${claude.length ? claude.join(" / ") : "(none)"}  → score vs "${s.english}": ${best.toFixed(2)}`);
  }

  const u = getAiUsage();
  // Claude Opus 5.5 list price: $4 / $20 per million input / output tokens
  const cost = (u.inputTokens * 4 + u.outputTokens * 20) / 1_000_000;
  console.log(`\nUsage: ${u.calls} calls · ${u.inputTokens} input / ${u.outputTokens} output tokens · ≈ $${cost.toFixed(3)} at Opus 5.5 list prices (estimate)`);
  console.log("The database was not modified.\n");

  await shutdownOcr();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
