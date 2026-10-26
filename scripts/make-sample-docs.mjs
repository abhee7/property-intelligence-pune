import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] || "sample-docs";
function render(lines, file, { w = 1240, h = 1000, jitter = false } = {}) {
  const c = createCanvas(w, h);
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
  x.fillStyle = "#111";
  let y = 70;
  for (const [text, size, bold] of lines) {
    x.font = `${bold ? "bold " : ""}${size}px Arial, "Liberation Sans", "DejaVu Sans", sans-serif`;
    x.fillText(text, 60, y);
    y += size * 1.7;
  }
  writeFileSync(join(out, file), c.toBuffer("image/png"));
}

render([
  ["Government of Maharashtra", 38, true],
  ["VILLAGE FORM 7/12 - RECORD OF RIGHTS (Satbara Utara)", 28, true],
  ["", 20],
  ["Village: Hinjewadi", 28],
  ["Taluka: Mulshi", 28],
  ["District: Pune", 28],
  ["Survey No: 118/2A", 28],
  ["Area: 0.40 H.R", 28],
  ["Khatedar: Shri Rajesh Suresh Mehta", 28],
  ["Date: 12/03/2024", 28],
], "712-mehta-match.png");

render([
  ["Government of Maharashtra", 38, true],
  ["VILLAGE FORM 7/12 - RECORD OF RIGHTS", 28, true],
  ["", 20],
  ["Village: Kharadi", 28],
  ["Taluka: Haveli", 28],
  ["District: Pune", 28],
  ["Survey No: 42/3A", 28],
  ["Area: 2 Guntha", 28],
  ["Owner: Smt. Sunita Patil", 28],
  ["Date: 05/11/2023", 28],
], "712-patil-other.png");

render([
  ["DEED OF SALE (Sale Deed)", 38, true],
  ["", 20],
  ["Registration No: HVL-4521-2024", 28],
  ["Date: 21 March 2024", 28],
  ["Vendor: Shri Rajesh Suresh Mehta", 28],
  ["Purchaser: Mr. Anil Kulkarni", 28],
  ["Property: Survey No. 118/2A, Village: Hinjewadi", 28],
  ["Area: 4,000 sq ft", 28],
  ["Consideration: Rs. 45,00,000", 28],
], "sale-deed.png");
console.log("ok");

// ─── PDFs: one scanned (image only → needs OCR), one with a real text layer ───

function buildPdf(objects) {
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [];
  let pos = parts[0].length;
  objects.forEach((obj, i) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), obj, Buffer.from("\nendobj\n")]);
    parts.push(b);
    pos += b.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (const o of offsets) xref.push(`${String(o).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`);
  parts.push(Buffer.from(xref.join("")));
  return Buffer.concat(parts);
}

function scannedPdf(lines, file) {
  const w = 1240, h = 1000;
  const c = createCanvas(w, h);
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.fillStyle = "#111";
  let y = 70;
  for (const [text, size, bold] of lines) { x.font = `${bold ? "bold " : ""}${size}px Arial, "Liberation Sans", "DejaVu Sans", sans-serif`; x.fillText(text, 60, y); y += size * 1.7; }
  const jpg = c.toBuffer("image/jpeg", 85);
  const pw = 595, ph = Math.round(595 * h / w);
  const content = Buffer.from(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`);
  const pdf = buildPdf([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`), jpg, Buffer.from("\nendstream")]),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]),
  ]);
  writeFileSync(join(out, file), pdf);
}

function textPdf(lines, file) {
  let stream = "BT /F1 14 Tf 50 780 Td 20 TL\n";
  for (const l of lines) stream += `(${l.replace(/([()\\])/g, "\\$1")}) Tj T*\n`;
  stream += "ET";
  const content = Buffer.from(stream);
  const pdf = buildPdf([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]),
  ]);
  writeFileSync(join(out, file), pdf);
}

scannedPdf([
  ["Government of Maharashtra", 38, true],
  ["VILLAGE FORM 7/12 - RECORD OF RIGHTS", 28, true],
  ["", 20],
  ["Village: Hinjewadi", 28],
  ["Taluka: Mulshi", 28],
  ["Survey No: 118/2A", 28],
  ["Area: 4,000 sq ft", 28],
  ["Khatedar: Shri Rajesh Mehta", 28],
  ["Date: 12/03/2024", 28],
], "712-scanned.pdf");

textPdf([
  "PROPERTY TAX RECEIPT",
  "Pune Municipal Corporation",
  "Receipt Date: 15/07/2025",
  "Owner: Rajesh Mehta",
  "Survey No: 118/2A",
  "Village: Hinjewadi",
  "Amount Paid: Rs. 18,450",
], "tax-receipt-text.pdf");
console.log("pdfs ok");

// ─── Samples that line up with seeded property "prop-002" (Bungalow at Jejuri) ───

render([
  ["Government of Maharashtra", 38, true],
  ["VILLAGE FORM 7/12 - RECORD OF RIGHTS", 28, true],
  ["", 20],
  ["Village: Jejuri", 28],
  ["Taluka: Purandar", 28],
  ["District: Pune", 28],
  ["Survey No: 9/13", 28],
  ["Area: 18,492 sq ft", 28],
  ["Khatedar: Shri Rajesh Kadam", 28],
  ["Date: 02/02/2024", 28],
], "712-prop-002-match.png");

render([
  ["Government of Maharashtra", 38, true],
  ["VILLAGE FORM 7/12 - RECORD OF RIGHTS", 28, true],
  ["", 20],
  ["Village: Jejuri", 28],
  ["Taluka: Purandar", 28],
  ["District: Pune", 28],
  ["Survey No: 9/13", 28],
  ["Area: 11,000 sq ft", 28],
  ["Khatedar: Shri Vinod Shinde", 28],
  ["Date: 02/02/2024", 28],
], "712-prop-002-conflict.png");
console.log("prop-002 samples ok");
