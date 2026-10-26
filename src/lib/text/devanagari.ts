// src/lib/text/devanagari.ts
//
// Rule-based Devanagari → Latin transliteration for Marathi / Hindi names and places.
// Pure, offline, deterministic — used when no AI is configured, and as a cross-check when it is.
//
// It produces a *phonetic* spelling ("कुलकर्णी" → "kulkarni", "मेहता" → "mehta"), not the one
// conventional spelling a family uses ("Kulkarni" vs "Kulkarny"), so compare the result with
// phonetic matching (see phonetic.ts), never with exact equality.

const INDEPENDENT_VOWELS: Record<string, string> = {
  अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ऋ: "ru", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o", ऍ: "e",
};

// keys are combining marks, so they must be quoted
const VOWEL_SIGNS: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ru", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॉ": "o",
};

const CONSONANTS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n",
  च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", व: "v",
  श: "sh", ष: "sh", स: "s", ह: "h", ळ: "l",
};

const NUKTA = "़";
const NUKTA_FORMS: Record<string, string> = { ज: "z", फ: "f", क: "k", ख: "kh", ग: "g", ड: "d", ढ: "dh" };

const VIRAMA = "्";
const ANUSVARA = "ं";
const CHANDRABINDU = "ँ";
const VISARGA = "ः";
const LABIALS = new Set(["प", "फ", "ब", "भ", "म"]);

const DEV_DIGITS = "०१२३४५६७८९";

export const hasDevanagariText = (s: string | null | undefined): boolean => !!s && /[ऀ-ॿ]/.test(s);

interface Unit {
  cons: string; // consonant sounds ("" for an independent vowel)
  vowel: string | null; // explicit vowel ("" = halant: joins the next consonant); null = inherent 'a'
  after: string; // nasal / visarga attached after the syllable
}

function parseWord(run: string): Unit[] {
  const units: Unit[] = [];
  const chars = [...run];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (INDEPENDENT_VOWELS[ch]) {
      units.push({ cons: "", vowel: INDEPENDENT_VOWELS[ch], after: "" });
      continue;
    }

    if (CONSONANTS[ch]) {
      let cons = CONSONANTS[ch];
      // the two conjuncts with their own sound in Marathi: क्ष → ksh, ज्ञ → dny
      if (ch === "क" && chars[i + 1] === VIRAMA && chars[i + 2] === "ष") {
        cons = "ksh";
        i += 2;
      } else if (ch === "ज" && chars[i + 1] === VIRAMA && chars[i + 2] === "ञ") {
        cons = "dny";
        i += 2;
      } else if (chars[i + 1] === NUKTA) {
        cons = NUKTA_FORMS[ch] ?? cons;
        i += 1;
      }

      const next = chars[i + 1];
      if (next && VOWEL_SIGNS[next]) {
        units.push({ cons, vowel: VOWEL_SIGNS[next], after: "" });
        i += 1;
      } else if (next === VIRAMA) {
        units.push({ cons, vowel: "", after: "" });
        i += 1;
      } else {
        units.push({ cons, vowel: null, after: "" });
      }
      continue;
    }

    const prev = units[units.length - 1];
    if (ch === ANUSVARA || ch === CHANDRABINDU) {
      // homorganic nasal: 'm' before a labial, otherwise 'n'
      if (prev) prev.after = LABIALS.has(chars[i + 1] ?? "") ? "m" : "n";
    } else if (ch === VISARGA) {
      if (prev) prev.after = "h";
    }
    // anything else (ZWJ, stray signs) is ignored
  }
  return units;
}

/**
 * Hindi/Marathi drop the inherent 'a' in many positions ("कदम" is "kadam", not "kadama"; "कुलकर्णी" is "kulkarni").
 * Rules used (simplified from the standard schwa-deletion algorithm):
 *   - never keep it at the end of a word;
 *   - never delete it in the first syllable or when a nasal follows ("संजय" → "sanjay");
 *   - otherwise delete it when the syllable before keeps a vowel and the syllable after has one.
 */
function render(units: Unit[]): string {
  const keep: boolean[] = [];
  const hasVowelAfter = (idx: number) => {
    const u = units[idx];
    if (!u) return false;
    if (u.vowel) return true; // explicit vowel
    if (u.vowel === null) return idx < units.length - 1 || !!u.after; // inherent: kept unless word-final
    return false; // halant
  };

  units.forEach((u, i) => {
    if (u.vowel !== null) return void (keep[i] = true);
    const last = i === units.length - 1;
    if (last && !u.after) return void (keep[i] = false);
    if (u.after || i === 0) return void (keep[i] = true);

    const prev = units[i - 1];
    const prevKeepsVowel = !!prev.vowel || (prev.vowel === null && keep[i - 1]);
    keep[i] = !(prevKeepsVowel && hasVowelAfter(i + 1));
  });

  return units
    .map((u, i) => {
      if (u.vowel === "") return u.cons; // halant
      const v = u.vowel !== null ? u.vowel : keep[i] ? "a" : "";
      return u.cons + v + u.after;
    })
    .join("");
}

/** "राजेश मेहता" → "rajesh mehta". Latin text and punctuation pass through; Devanagari digits become 0-9. */
export function transliterateDevanagari(input: string): string {
  return input
    .replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)))
    .replace(/[।॥]/g, " ")
    .replace(/[ऀ-ॿ]+/g, (run) => render(parseWord(run)))
    .replace(/\s+/g, " ")
    .trim();
}

/** "rajesh mehta" → "Rajesh Mehta" (for showing to people) */
export const titleCase = (s: string): string => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
