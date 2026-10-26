import { readFileSync } from "node:fs";
import { extractText, shutdownOcr } from "../src/modules/documents/ocr/ocr.engine";
import { extractFields } from "../src/modules/documents/ocr/field-extractor";

async function main() {
  for (const f of process.argv.slice(2)) {
    const mime = f.endsWith(".pdf") ? "application/pdf" : "image/png";
    const r = await extractText(readFileSync(f), mime);
    console.log(`\n=== ${f}  [${r.method}, ${r.pages}p, conf ${r.confidence.toFixed(1)}, ${r.durationMs}ms]`);
    console.log(r.text.trim());
    const x = extractFields(r.text);
    console.log("--- kind:", x.detectedKind, "| found", x.found.length + "/" + x.expected.length);
    console.log(x.fields);
  }
  await shutdownOcr();
}
main().catch((e) => { console.error(e); process.exit(1); });
