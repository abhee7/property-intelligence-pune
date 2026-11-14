// Measures how accurately PropIntel reads a folder of real documents, against values you wrote down.
//
//   npx tsx scripts/eval-real-scans.ts <folder-with-pdfs-or-images> <truth.json> [--show]
//
// truth.json maps each file name to what the document really says, e.g.
//   { "233_10.pdf": { "kind": "seven_twelve", "survey": "233/10", "village": "...", "taluka": "...",
//                     "district": "...", "owners": ["...", "..."], "totalAreaSqm": 250 } }
// Every key is optional; only the fields you give are scored.
//
// It prints accuracy per field as counts. Names are NOT printed unless you pass --show (for your own
// eyes while debugging). Real documents contain real people's details: keep both the folder and the
// truth file out of version control (this repo's .gitignore already excludes real-scans/).

import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { extractText, shutdownOcr } from "../src/modules/documents/ocr/ocr.engine";
import { extractFields, normalizeDigits, type ExtractedFields } from "../src/modules/documents/ocr/field-extractor";

interface Truth {
  kind?: string;
  survey?: string;
  village?: string;
  taluka?: string;
  district?: string;
  owners?: string[];
  totalAreaSqm?: number;
}

const [dir, truthPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const show = process.argv.includes("--show");
if (!dir || !truthPath) {
  console.error("usage: npx tsx scripts/eval-real-scans.ts <folder> <truth.json> [--show]");
  process.exit(1);
}
const truth: Record<string, Truth> = JSON.parse(readFileSync(truthPath, "utf8"));

const norm = (s: string | undefined) => normalizeDigits((s ?? "").normalize("NFC")).replace(/[\s.​‌‍]+/g, "").toLowerCase();
/** Levenshtein distance, for "within one character" */
function dist(a: string, b: string): number {
  const m = [...a], n = [...b];
  const d: number[][] = Array.from({ length: m.length + 1 }, (_, i) => [i, ...Array(n.length).fill(0)]);
  for (let j = 1; j <= n.length; j++) d[0][j] = j;
  for (let i = 1; i <= m.length; i++)
    for (let j = 1; j <= n.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (m[i - 1] === n[j - 1] ? 0 : 1));
  return d[m.length][n.length];
}

interface Tally { right: number; total: number }
const tally: Record<string, Tally> = {};
const bump = (field: string, right: boolean) => {
  const t = (tally[field] ??= { right: 0, total: 0 });
  t.total++;
  if (right) t.right++;
};
let nameWithinOne = 0;
let falseNames = 0;
let readNames = 0;
const times: number[] = [];

async function main() {
  const files = readdirSync(dir).filter((f) => [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"].includes(extname(f).toLowerCase())).sort();
  for (const f of files) {
    const t = truth[f];
    if (!t) continue;
    const mime = f.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png";
    const t0 = Date.now();
    const r = await extractText(readFileSync(join(dir, f)), mime);
    times.push(Date.now() - t0);
    const x = extractFields(r.text, "unknown");
    const got: ExtractedFields & { ownerNames?: string[] } = x.fields as any;

    if (t.kind) bump("document kind", x.detectedKind === t.kind);
    if (t.survey) bump("survey number", norm(got.surveyNumber) === norm(t.survey));
    if (t.village) bump("village", norm(got.village) === norm(t.village));
    if (t.taluka) bump("taluka", norm(got.taluka) === norm(t.taluka));
    if (t.district) bump("district", norm(got.district) === norm(t.district));
    if (t.totalAreaSqm !== undefined) {
      const sqm = got.areaSqft !== undefined ? got.areaSqft / 10.7639 : undefined;
      bump("total area", sqm !== undefined && Math.abs(sqm - t.totalAreaSqm) <= 0.6);
    }
    if (t.owners) {
      const found = (got.ownerNames ?? (got.ownerName ? [got.ownerName] : [])).map(norm);
      readNames += found.length;
      const wanted = t.owners.map(norm);
      for (const w of wanted) {
        bump("occupant names (exact)", found.includes(w));
        if (!found.includes(w) && found.some((g) => dist(g, w) <= 1)) nameWithinOne++;
      }
      falseNames += found.filter((g) => !wanted.some((w) => dist(g, w) <= 1)).length;
    }
    if (show) {
      console.log(`\n--- ${f.replace(/[^\x20-\x7E]+/g, "?")}  (${r.method}, conf ${r.confidence.toFixed(0)}, ${Date.now() - t0} ms)`);
      console.log("   read:", JSON.stringify({ ...got, ownerNames: got.ownerNames?.length ? `${got.ownerNames.length} names` : undefined }));
      if (t.owners && got.ownerNames) {
        const wanted = new Set(t.owners.map(norm));
        for (const g of got.ownerNames) if (!wanted.has(norm(g))) console.log("   name not in truth:", g);
        for (const w of t.owners) if (!got.ownerNames.map(norm).includes(norm(w))) console.log("   name missed:", w);
      }
    }
  }
  await shutdownOcr();

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  console.log("\nField accuracy on", times.length, "documents");
  console.log("-".repeat(52));
  for (const [field, t] of Object.entries(tally)) console.log(`${field.padEnd(26)} ${String(t.right).padStart(3)} / ${String(t.total).padEnd(3)}  ${pct(t.right, t.total)}`);
  const names = tally["occupant names (exact)"];
  if (names) console.log(`${"names within 1 character".padEnd(26)} ${String(names.right + nameWithinOne).padStart(3)} / ${String(names.total).padEnd(3)}  ${pct(names.right + nameWithinOne, names.total)}`);
  if (names) console.log(`${"names read that aren't real".padEnd(26)} ${String(falseNames).padStart(3)} of ${readNames} read`);
  console.log(`time per document: ${Math.round(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length))} ms on average`);
}
main().catch((e) => { console.error(e); process.exit(1); });
