// Downloads Tesseract language data into ./ocr-data so OCR works offline.
// Usage: node scripts/download-ocr-data.mjs [eng mar hin]

import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://tessdata.projectnaptha.com/4.0.0";
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ["eng", "mar"];
const dir = join(process.cwd(), "ocr-data");

await mkdir(dir, { recursive: true });

for (const lang of langs) {
  const file = join(dir, `${lang}.traineddata.gz`);
  try {
    const s = await stat(file);
    if (s.size > 0) {
      console.log(`✓ ${lang} already present (${(s.size / 1048576).toFixed(1)} MB)`);
      continue;
    }
  } catch {}

  process.stdout.write(`↓ ${lang} ... `);
  const res = await fetch(`${BASE}/${lang}.traineddata.gz`);
  if (!res.ok) {
    console.log(`failed (HTTP ${res.status})`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  console.log(`${(buf.length / 1048576).toFixed(1)} MB`);
}
