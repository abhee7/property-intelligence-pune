// src/modules/documents/ocr/ocr.engine.ts
//
// Turns an uploaded file (image or PDF) into text.
//   - Images  → sharp preprocessing → Tesseract.js
//   - PDFs    → embedded text layer if present, else render page → Tesseract.js
// Runs fully offline once the language data is in ./ocr-data
// (see scripts/download-ocr-data.mjs). Server-side only.

import * as fs from "fs";
import * as path from "path";

export interface OcrResult {
  text: string;
  confidence: number; // 0..100
  pages: number;
  method: "image-ocr" | "pdf-text" | "pdf-ocr" | "pdf-mixed" | "claude-vision";
  languages: string;
  durationMs: number;
}

const LANGS = process.env.OCR_LANGS || "eng+mar";
const MAX_PDF_PAGES = Number(process.env.OCR_MAX_PDF_PAGES || 8);
const MIN_TEXT_LAYER_CHARS = 40; // below this a PDF page is treated as scanned

const LANG_DIR = path.join(process.cwd(), "ocr-data");
const CACHE_DIR = path.join(process.cwd(), ".ocr-cache");

// ─── Tesseract workers ───
// A fast English-only worker is always tried first. English documents scan noticeably better
// with it (the Marathi model "sees" Devanagari characters in speckle and mangles digits and
// slashes). The combined English+Marathi worker only runs when the first pass isn't confident.

type TessWorker = {
  recognize: (img: Buffer) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

const globalForOcr = globalThis as unknown as { __ocrWorkers?: Map<string, Promise<TessWorker>> };

const PRIMARY_LANGS = "eng";
const CONFIDENT_ENOUGH = 80; // an English pass at or above this is accepted as is

function localLangDataAvailable(langs: string): boolean {
  return langs.split("+").every((l) => fs.existsSync(path.join(LANG_DIR, `${l}.traineddata.gz`)));
}

function getWorker(langs: string): Promise<TessWorker> {
  globalForOcr.__ocrWorkers ??= new Map();
  const workers = globalForOcr.__ocrWorkers;

  let pending = workers.get(langs);
  if (!pending) {
    pending = (async () => {
      const { createWorker } = await import("tesseract.js");
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const worker = await createWorker(langs, 1, {
        cachePath: CACHE_DIR,
        ...(localLangDataAvailable(langs) ? { langPath: LANG_DIR } : {}),
      });
      return worker as unknown as TessWorker;
    })().catch((err) => {
      workers.delete(langs); // let the next job retry
      throw err;
    });
    workers.set(langs, pending);
  }
  return pending;
}

export async function shutdownOcr(): Promise<void> {
  const workers = globalForOcr.__ocrWorkers;
  globalForOcr.__ocrWorkers = undefined;
  if (workers) await Promise.all([...workers.values()].map(async (w) => (await w).terminate()));
}

// ─── Image preprocessing ───

async function preprocess(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const img = sharp(buffer, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
  const meta = await img.metadata();
  const width = meta.width || 0;

  // median(3) removes salt-and-pepper speckle (dust on the glass, photocopier noise)
  let pipeline = img.grayscale().median(3).normalize();
  if (width && width < 1500) pipeline = pipeline.resize({ width: 2000, kernel: "lanczos3" });
  else if (width > 4000) pipeline = pipeline.resize({ width: 4000 });
  // density tells Tesseract the scan is ~300 dpi (otherwise it warns and guesses)
  return pipeline.sharpen().withMetadata({ density: 300 }).png().toBuffer();
}

interface ImageOcr { text: string; confidence: number; languages: string }

async function recognise(prepared: Buffer, langs: string): Promise<ImageOcr> {
  const { data } = await (await getWorker(langs)).recognize(prepared);
  return { text: data.text || "", confidence: data.confidence ?? 0, languages: langs };
}

async function ocrImage(buffer: Buffer): Promise<ImageOcr> {
  const prepared = await preprocess(buffer);
  const first = await recognise(prepared, PRIMARY_LANGS);
  if (LANGS === PRIMARY_LANGS || first.confidence >= CONFIDENT_ENOUGH) return first;

  // Not confident — maybe it is a Marathi document. Try the full language set and keep the better read.
  const second = await recognise(prepared, LANGS);
  return second.confidence > first.confidence ? second : first;
}

// ─── PDF handling ───
//
// Scanned PDFs are just pages containing a big image. We pull those images out of
// the page's operator list and OCR them at their original resolution. (We deliberately
// don't rasterise pages through a canvas — it's slower, lower quality, and a native
// crash there would take the whole server down.)

type RawImage = { width: number; height: number; data: Uint8Array | Uint8ClampedArray; kind?: number };

const MIN_IMAGE_PIXELS = 150_000; // ignore logos / stamps / icons

function waitFor<T>(register: (cb: (v: T) => void) => void, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    register((v) => { clearTimeout(t); resolve(v); });
  });
}

async function rawImageToPng(img: RawImage): Promise<Buffer | null> {
  const sharp = (await import("sharp")).default;
  const { width, height, data } = img;
  const px = width * height;

  let channels: 1 | 3 | 4;
  let pixels: Uint8Array | Uint8ClampedArray = data;

  if (data.length === px * 4) channels = 4;
  else if (data.length === px * 3) channels = 3;
  else if (data.length === px) channels = 1;
  else if (img.kind === 1 || data.length === Math.ceil(width / 8) * height) {
    // 1 bit per pixel, rows padded to whole bytes
    const rowBytes = Math.ceil(width / 8);
    const out = new Uint8Array(px);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        out[y * width + x] = data[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7)) ? 255 : 0;
    pixels = out;
    channels = 1;
  } else return null;

  return sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

async function ocrPdf(buffer: Buffer): Promise<Omit<OcrResult, "durationMs">> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const OPS = pdfjs.OPS;

  // Not require.resolve(): in a bundled production build that returns a module id (a number),
  // not a path. The server always runs with the app root as cwd (also inside Docker).
  const fontDir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    ...(fs.existsSync(fontDir) ? { standardFontDataUrl: fontDir + path.sep } : {}),
    verbosity: 0,
  }).promise;

  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  const texts: string[] = [];
  const confidences: number[] = [];
  const languagesUsed = new Set<string>();
  let usedLayer = 0;
  let usedOcr = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);

    // 1. Digital PDFs carry their own text — no OCR needed
    const content = await page.getTextContent();
    const layerText = content.items.map((it: any) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("");
    if (layerText.replace(/\s/g, "").length >= MIN_TEXT_LAYER_CHARS) {
      texts.push(layerText);
      confidences.push(99);
      usedLayer++;
      page.cleanup();
      continue;
    }

    // 2. Scanned page → pull out the embedded image(s) and OCR them
    const ops = await page.getOperatorList();
    const images: RawImage[] = [];
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k];
      const arg = ops.argsArray[k]?.[0];
      if (fn === OPS.paintInlineImageXObject && arg?.data) {
        images.push(arg);
      } else if (fn === OPS.paintImageXObject && typeof arg === "string") {
        const store = arg.startsWith("g_") ? page.commonObjs : page.objs;
        const obj = await waitFor<RawImage>((cb) => store.get(arg, cb), 5000);
        if (obj?.data) images.push(obj);
      }
    }

    let pageText = "";
    let pageConf = 0;
    let n = 0;
    for (const img of images.filter((im) => im.width * im.height >= MIN_IMAGE_PIXELS)) {
      const png = await rawImageToPng(img);
      if (!png) continue;
      const r = await ocrImage(png);
      pageText += r.text + "\n";
      pageConf += r.confidence;
      languagesUsed.add(r.languages);
      n++;
    }
    if (n) {
      texts.push(pageText);
      confidences.push(pageConf / n);
      usedOcr++;
    } else {
      texts.push("");
      confidences.push(0);
    }
    page.cleanup();
  }
  await doc.destroy();

  const method = usedLayer && usedOcr ? "pdf-mixed" : usedOcr ? "pdf-ocr" : "pdf-text";
  return {
    text: texts.join("\n\n"),
    confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
    pages: pageCount,
    method,
    languages: [...languagesUsed].join(", ") || "text layer",
  };
}

// ─── Public API ───

export async function extractText(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const started = Date.now();

  if (mimeType === "application/pdf") {
    const r = await ocrPdf(buffer);
    return { ...r, durationMs: Date.now() - started };
  }

  const r = await ocrImage(buffer);
  return {
    text: r.text,
    confidence: r.confidence,
    pages: 1,
    method: "image-ocr",
    languages: r.languages,
    durationMs: Date.now() - started,
  };
}
