// __tests__/unit/ai/reader.test.ts

import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import {
  shouldUseClaude, chooseReading, claudeConfidence, buildContentBlocks, readDocumentWithClaude, READER_SYSTEM_PROMPT,
} from "@/modules/documents/ocr/claude.reader";
import { extractFields } from "@/modules/documents/ocr/field-extractor";

describe("shouldUseClaude", () => {
  const base = { configured: true, tesseractConfidence: 94, tesseractCompleteness: 1, tesseractTextLength: 400 };

  it("never runs when off or not configured", () => {
    expect(shouldUseClaude({ ...base, mode: "off", tesseractConfidence: 10 })).toBe(false);
    expect(shouldUseClaude({ ...base, mode: "always", configured: false })).toBe(false);
  });
  it("always mode reads every document", () => {
    expect(shouldUseClaude({ ...base, mode: "always" })).toBe(true);
  });
  it("fallback mode leaves clean scans to Tesseract", () => {
    expect(shouldUseClaude({ ...base, mode: "fallback" })).toBe(false);
  });
  it.each([
    ["low confidence", { tesseractConfidence: 58 }],
    ["missing fields", { tesseractCompleteness: 0.5 }],
    ["almost no text", { tesseractTextLength: 12 }],
  ])("fallback mode steps in for %s", (_n, over) => {
    expect(shouldUseClaude({ ...base, mode: "fallback", ...over })).toBe(true);
  });
});

describe("chooseReading — Claude only wins when it is usable and at least as complete", () => {
  const t = (confidence: number, completeness: number, textLength = 300) => ({ confidence, completeness, textLength });
  const c = (legibility: "good" | "fair" | "poor", completeness: number, textLength = 300) => ({ legibility, completeness, textLength });

  it("takes Claude when Tesseract found nothing", () => expect(chooseReading({ tesseract: t(20, 0, 5), claude: c("fair", 0.5) })).toBe("claude"));
  it("takes Claude when it extracts more fields", () => expect(chooseReading({ tesseract: t(70, 0.5), claude: c("good", 1) })).toBe("claude"));
  it("takes Claude on a shaky Tesseract read when it is as complete", () => expect(chooseReading({ tesseract: t(55, 1), claude: c("good", 1) })).toBe("claude"));
  it("keeps Tesseract when it is confident and as complete", () => expect(chooseReading({ tesseract: t(94, 1), claude: c("good", 1) })).toBe("tesseract"));
  it("never trusts a 'poor' Claude reading", () => expect(chooseReading({ tesseract: t(40, 0.25), claude: c("poor", 1) })).toBe("tesseract"));
  it("ignores an empty Claude answer", () => expect(chooseReading({ tesseract: t(40, 0.25), claude: c("good", 1, 3) })).toBe("tesseract"));
});

describe("claudeConfidence", () => {
  it("maps legibility to the scale the verification step uses (below 65 holds fields back)", () => {
    expect(claudeConfidence("good")).toBeGreaterThanOrEqual(90);
    expect(claudeConfidence("fair")).toBeGreaterThanOrEqual(65);
    expect(claudeConfidence("poor")).toBeLessThan(65);
  });
});

describe("buildContentBlocks", () => {
  it("sends a PDF as a document block", async () => {
    const blocks = (await buildContentBlocks(Buffer.from("%PDF-1.4 fake"), "application/pdf")) as any[];
    expect(blocks[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
    expect(blocks[1].type).toBe("text");
  });

  it("converts an image to a size-limited JPEG image block", async () => {
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#fff" } }).png().toBuffer();
    const blocks = (await buildContentBlocks(png, "image/png")) as any[];

    expect(blocks[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    const meta = await sharp(Buffer.from(blocks[0].source.data, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2400);
  });
});

describe("readDocumentWithClaude", () => {
  const transcription = "VILLAGE FORM 7/12\nVillage: Hinjewadi\nTaluka: Mulshi\nSurvey No: 118/2A\nArea: 0.40 H.R\nKhatedar: Shri Rajesh Mehta\nDate: 12/03/2024";
  const reply = (over: Record<string, unknown> = {}) => ({
    stop_reason: "end_turn",
    model: "claude-opus-5-5",
    usage: { input_tokens: 1500, output_tokens: 300 },
    parsed_output: { transcription, language: "english", legibility: "good", document_type: "seven_twelve", illegible_parts: [], ...over },
  });
  const png = () => sharp({ create: { width: 800, height: 600, channels: 3, background: "#fff" } }).png().toBuffer();

  it("returns a transcription the normal extractor can use", async () => {
    const parse = vi.fn().mockResolvedValue(reply());
    const reading = await readDocumentWithClaude(await png(), "image/png", { client: { beta: { messages: { parse } } } });

    expect(reading).toMatchObject({ method: "claude-vision", legibility: "good", confidence: 92, documentType: "seven_twelve", model: "claude-opus-5-5" });
    const extraction = extractFields(reading.text, "seven_twelve");
    expect(extraction.fields).toMatchObject({ surveyNumber: "118/2A", ownerName: "Rajesh Mehta", village: "Hinjewadi" });
    expect(extraction.completeness).toBe(1);
  });

  it("sends the image, the transcription rules and a schema — and treats the document as untrusted", async () => {
    const parse = vi.fn().mockResolvedValue(reply());
    await readDocumentWithClaude(await png(), "image/png", { client: { beta: { messages: { parse } } } });

    const sent = parse.mock.calls[0][0];
    expect(sent.messages[0].content[0].type).toBe("image");
    expect(sent.system).toBe(READER_SYSTEM_PROMPT);
    expect(sent.output_config.format.type).toBe("json_schema");
    expect(READER_SYSTEM_PROMPT).toMatch(/never guess/i);
    expect(READER_SYSTEM_PROMPT).toMatch(/untrusted data/i);
    expect(READER_SYSTEM_PROMPT).toMatch(/\[illegible\]/);
  });

  it("carries through illegible-part notes and a 'poor' rating", async () => {
    const parse = vi.fn().mockResolvedValue(reply({ legibility: "poor", illegible_parts: ["stamp over the survey number"] }));
    const reading = await readDocumentWithClaude(await png(), "image/png", { client: { beta: { messages: { parse } } } });
    expect(reading.legibility).toBe("poor");
    expect(reading.confidence).toBeLessThan(65);
    expect(reading.illegibleParts).toEqual(["stamp over the survey number"]);
  });

  it("propagates an API refusal as an AiError", async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: "refusal", parsed_output: null, usage: {} });
    await expect(readDocumentWithClaude(await png(), "image/png", { client: { beta: { messages: { parse } } } })).rejects.toMatchObject({ kind: "refused" });
  });
});
