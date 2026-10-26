// Generates sample scanned documents for the properties the dataset import tagged with a
// `docScenario`, and pushes them through the REAL upload → OCR → verification → risk pipeline.
//
//   npm run dataset:documents                 → add documents (skips properties that already have some)
//   npm run dataset:documents -- --reset      → delete those properties' documents first
//
// The documents are rendered images with the property's real record values (or, for the
// mismatch scenarios, deliberately wrong ones) — nothing about the verdicts is hard-coded:
// each document is OCR'd, extracted and compared exactly like an upload from the UI.

import * as fs from "node:fs";
import * as path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { prisma } from "../src/lib/db/client";
import { uploadDocument } from "../src/modules/documents/document.service";
import { waitForOcrIdle } from "../src/modules/documents/ocr/ocr.service";
import { waitForRiskIdle } from "../src/modules/risk/risk.service";
import { mulberry32 } from "../src/modules/dataset/pune-dataset";

// The sample documents must stay reproducible and free — never send them to Claude, even if a key is configured
process.env.AI_SCAN_READING = "off";

const reset = process.argv.includes("--reset");
const rng = mulberry32(2026);
const pick = <T>(a: T[]): T => a[Math.floor(rng() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

// ─── Rendering ───

type Line = [text: string, size?: number, bold?: boolean];

let fontChecked = false; // the blank-page guard in renderPage runs once

/**
 * Draws text lines onto a page; ~1 in 3 get a slight skew and speckle noise so they look scanned.
 * Pages for the showcase scenarios (wrong owner / wrong property / wrong type) are always drawn
 * clean, so their verdict is the point being made and isn't lost to an unlucky scan.
 */
function renderPage(lines: Line[], clear = false): Buffer {
  const w = 1240, h = 1000;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);

  const scanned = rng() < 0.35 && !clear;
  if (scanned) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(((rng() - 0.5) * 2.2 * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
  }

  ctx.fillStyle = "#151515";
  let y = 70;
  for (const [text, size = 28, bold = false] of lines) {
    ctx.font = `${bold ? "bold " : ""}${size}px Arial, "Liberation Sans", "DejaVu Sans", sans-serif`;
    ctx.fillText(text, 60, y);
    y += size * 1.7;
  }

  // Guard: with no usable fonts the canvas silently draws nothing. Every page would then be the
  // same blank image and fail later with a baffling "file already uploaded" error.
  if (!fontChecked) {
    const px = ctx.getImageData(0, 0, w, h).data;
    let dark = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 100) dark++;
    if (dark === 0) throw new Error('No usable font to draw sample documents with — install one (Debian/Ubuntu: apt-get install fonts-liberation fontconfig).');
    fontChecked = true;
  }

  if (scanned) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let i = 0; i < 260; i++) ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
  return canvas.toBuffer("image/png");
}

const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const recentDate = () => new Date(Date.UTC(int(2023, 2026), int(0, 9), int(1, 28)));
const num = (n: number) => Math.round(n).toLocaleString("en-US");

interface Facts { owner: string; survey: string; village: string; taluka: string; area: number }

const sevenTwelve = (f: Facts): Line[] => [
  ["Government of Maharashtra", 38, true],
  ["VILLAGE FORM 7/12 - RECORD OF RIGHTS", 28, true],
  ["", 20],
  [`Village: ${f.village}`],
  [`Taluka: ${f.taluka}`],
  ["District: Pune"],
  [`Survey No: ${f.survey}`],
  [`Area: ${num(f.area)} sq ft`],
  [`Khatedar: Shri ${f.owner}`],
  [`Date: ${dmy(recentDate())}`],
];

const titleDeed = (f: Facts): Line[] => [
  ["TITLE DEED", 38, true],
  ["", 20],
  [`Registration No: PUN-${int(1000, 9999)}-${int(2015, 2025)}`],
  [`Date: ${dmy(recentDate())}`],
  [`Owner: Shri ${f.owner}`],
  [`Property: Survey No. ${f.survey}, Village: ${f.village}`],
  [`Area: ${num(f.area)} sq ft`],
];

const encumbrance = (f: Facts): Line[] => [
  ["ENCUMBRANCE CERTIFICATE", 38, true],
  ["Nil encumbrance found", 28, true],
  ["", 20],
  [`Survey No: ${f.survey}`],
  [`Village: ${f.village}`],
  [`Taluka: ${f.taluka}`],
  ["Period: 01/04/2006 to 31/03/2026"],
  [`Date: ${dmy(recentDate())}`],
];

const saleDeed = (f: Facts): Line[] => [
  ["DEED OF SALE (Sale Deed)", 38, true],
  ["", 20],
  [`Registration No: HVL-${int(1000, 9999)}-${int(2018, 2025)}`],
  [`Date: ${dmy(recentDate())}`],
  [`Vendor: Shri ${f.owner}`],
  [`Purchaser: Mr. ${pick(["Anil Kulkarni", "Vikram Shah", "Sachin Mane", "Ravi Gupta"])}`],
  [`Property: Survey No. ${f.survey}, Village: ${f.village}`],
  [`Area: ${num(f.area)} sq ft`],
  [`Consideration: Rs. ${num(int(40, 400) * 100000)}`],
];

// ─── Run ───

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("No tenant — run `npm run db:seed` first.");

  const uploader = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: { name: "agency_admin" } }, select: { id: true } });
  if (!uploader) throw new Error("No agency_admin user found.");

  const types: { id: string; slug: string }[] = await prisma.documentType.findMany({ select: { id: true, slug: true } });
  const typeId = (slug: string) => {
    const t = types.find((x) => x.slug === slug);
    if (!t) throw new Error(`Document type "${slug}" missing`);
    return t.id;
  };

  const owners: { id: string; firstName: string; lastName: string }[] = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: { name: "land_owner" } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { id: "asc" },
  });

  const rows: any[] = await prisma.property.findMany({
    where: { tenantId: tenant.id, deletedAt: null, metadata: { contains: '"docScenario"' } },
    include: { owner: true },
    orderBy: { id: "asc" },
  });
  if (!rows.length) throw new Error("No properties are tagged with a document scenario — run `npm run dataset:import` first.");

  const factsOf = (p: any): Facts => {
    const meta = JSON.parse(p.metadata || "{}");
    return {
      owner: `${p.owner.firstName} ${p.owner.lastName}`,
      survey: p.surveyNumber,
      village: meta.village,
      taluka: meta.taluka,
      area: p.areaSqft,
    };
  };

  if (reset) {
    // only the files belonging to these properties' documents — never anything else in uploads/
    const mine: { fileUrl: string }[] = await prisma.document.findMany({ where: { propertyId: { in: rows.map((r) => r.id) } }, select: { fileUrl: true } });
    for (const d of mine) {
      try {
        fs.unlinkSync(path.join("uploads", "documents", path.basename(d.fileUrl)));
      } catch {}
    }
    const gone = await prisma.document.deleteMany({ where: { propertyId: { in: rows.map((r) => r.id) } } });
    console.log(`Reset: removed ${gone.count} existing documents`);
  }

  const existing = new Set<string>((await prisma.document.findMany({ where: { propertyId: { in: rows.map((r) => r.id) }, deletedAt: null }, select: { propertyId: true } })).map((d: any) => d.propertyId));

  let uploaded = 0;
  let cleanSeen = 0;
  const startedAt = Date.now();

  for (const p of rows) {
    if (existing.has(p.id)) continue;
    const meta = JSON.parse(p.metadata || "{}");
    const f = factsOf(p);
    const jobs: { slug: string; name: string; lines: Line[]; clear?: boolean }[] = [];

    switch (meta.docScenario as string) {
      case "clean": {
        cleanSeen++;
        jobs.push({ slug: "7-12-extract", name: "7_12_extract", lines: sevenTwelve(f) });
        jobs.push({ slug: "title-deed", name: "title_deed", lines: titleDeed(f) });
        if (cleanSeen <= 14) jobs.push({ slug: "encumbrance-cert", name: "encumbrance_certificate", lines: encumbrance(f) });
        break;
      }
      case "owner-mismatch": {
        // someone clearly different: not even a shared first name or surname
        const current = owners.find((o) => o.id === p.ownerId);
        const others = owners.filter((o) => o.id !== p.ownerId && o.firstName !== current?.firstName && o.lastName !== current?.lastName);
        const other = pick(others.length ? others : owners.filter((o) => o.id !== p.ownerId));
        jobs.push({ slug: "7-12-extract", name: "7_12_extract", clear: true, lines: sevenTwelve({ ...f, owner: `${other.firstName} ${other.lastName}` }) });
        jobs.push({ slug: "title-deed", name: "title_deed", lines: titleDeed(f) });
        break;
      }
      case "area-mismatch": {
        jobs.push({ slug: "7-12-extract", name: "7_12_extract", lines: sevenTwelve({ ...f, area: f.area * (0.55 + rng() * 0.2) }) });
        break;
      }
      case "wrong-property": {
        // a genuine 7/12 — but for some OTHER property in the dataset
        const other = pick(rows.filter((r) => r.id !== p.id));
        jobs.push({ slug: "7-12-extract", name: "7_12_extract", clear: true, lines: sevenTwelve(factsOf(other)) });
        break;
      }
      case "wrong-type": {
        jobs.push({ slug: "7-12-extract", name: "7_12_extract", clear: true, lines: saleDeed(f) }); // uploaded AS a 7/12
        break;
      }
    }

    for (const job of jobs) {
      const buffer = renderPage(job.lines, job.clear);
      await uploadDocument(tenant.id, uploader.id, p.id, typeId(job.slug), {
        buffer,
        originalName: `${job.name}_${p.id}.png`,
        mimeType: "image/png",
        size: buffer.length,
      });
      uploaded++;
    }
    process.stdout.write(`\r  ${uploaded} documents uploaded (${p.id})        `);
  }
  console.log(`\nUploaded ${uploaded} documents; waiting for OCR …`);

  // progress while the queue drains
  const timer = setInterval(async () => {
    const left = await prisma.document.count({ where: { ocrStatus: { in: ["PENDING", "PROCESSING"] } } });
    process.stdout.write(`\r  ${left} documents still being scanned …   `);
  }, 3000);
  await waitForOcrIdle();
  clearInterval(timer);
  await waitForRiskIdle();

  const docs: any[] = await prisma.document.findMany({ where: { propertyId: { in: rows.map((r) => r.id) } }, select: { ocrStatus: true, extractedData: true } });
  const byStatus: Record<string, number> = {};
  const byVerdict: Record<string, number> = {};
  for (const d of docs) {
    byStatus[d.ocrStatus] = (byStatus[d.ocrStatus] || 0) + 1;
    const v = JSON.parse(d.extractedData || "{}").verification?.overall ?? "none";
    byVerdict[v] = (byVerdict[v] || 0) + 1;
  }
  console.log(`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  console.log("OCR status:", byStatus);
  console.log("Verification:", byVerdict);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
