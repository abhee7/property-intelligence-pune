// src/modules/documents/ocr/layer-numerals.ts
//
// Government 7/12 PDFs (the "digital satbara" downloads) embed their Marathi font without a
// Unicode map, so the PDF's text layer is gibberish for every Devanagari word, yet the numerals
// in it are plain ASCII and exactly right. OCR is the opposite: good at the words, but it
// confuses digits ("0.0030" for "0.00.30"). This module reads just the numerals out of the text
// layer, by where they sit on the page, and states them as labelled lines the field extractor
// already understands. Pure function: positioned text items in, text out.

export interface LayerItem {
  str: string;
  /** distance from the left edge, in PDF points */
  x: number;
  /** distance from the top edge, in PDF points */
  y: number;
}

/**
 * Returns labelled lines for the survey number, khate numbers, total area and assessment, or
 * "" if the page does not look like the first page of a gaon namuna 7. Every figure is only
 * emitted when it passes a sanity check (e.g. total area = cultivable + pot-kharab).
 */
export function readSevenTwelveNumerals(items: LayerItem[], pageWidth: number, pageHeight: number): string {
  const it = items.map((i) => ({ ...i, str: i.str.replace(/\s+/g, "") })).filter((i) => i.str);

  // survey number + subdivision: "233/10", in the heading band
  const survey = it
    .filter((i) => /^\d{1,4}(?:\/\d{1,3}){1,2}$/.test(i.str) && i.y < pageHeight * 0.25)
    .sort((a, b) => a.y - b.y || a.x - b.x)[0];
  if (!survey) return "";

  const left = pageWidth * 0.25;
  const below = (i: LayerItem) => i.y > survey.y + 5 && i.y < pageHeight * 0.85;

  // khate (account) numbers run down the left of the occupant table
  const khate = it.filter((i) => /^\d{1,6}$/.test(i.str) && i.x < left && below(i)).sort((a, b) => a.y - b.y).map((i) => i.str);

  // area column on the far left: ha.are.sqm figures, the last of which is the grand total
  const areas = it.filter((i) => /^\d{1,3}\.\d{2}\.\d{2}$/.test(i.str) && i.x < left && below(i)).sort((a, b) => a.y - b.y);
  const total = areas[areas.length - 1];

  const lines: string[] = [`भूमापन क्रमांक व उपविभाग: ${survey.str}`];
  if (khate.length) lines.push(`खाते क्रमांक: ${[...new Set(khate)].join(", ")}`);
  if (total) {
    lines.push(`एकुण क्षेत्र हे.आर.चौ.मी: ${total.str}`);
    const assessment = it.filter((i) => /^\d{1,3}\.\d{2}$/.test(i.str) && i.x < left && i.y > total.y).sort((a, b) => a.y - b.y)[0];
    if (assessment) lines.push(`आकारणी: ${assessment.str}`);
  }
  return lines.join("\n");
}
