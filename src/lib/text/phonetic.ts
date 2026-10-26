// src/lib/text/phonetic.ts
//
// Phonetic comparison of Indian names written in Latin script. The same name has many accepted
// spellings (Kulkarni / Kulkarny, Hinjewadi / Hinjawadi, Patil / Patel, Gaikwad / Gaekwad), and a
// transliterated Marathi name rarely lands on the exact one. This reduces both sides to a rough
// sound skeleton before comparing, so spelling variants converge.
//
// Deliberately lossy — it is a similarity signal, never proof of identity, and its scores are
// capped below 1.0 so an exact match always outranks a phonetic one.

import { matchOwnerName, matchVillage } from "@/modules/matching/matching.algorithms";

function keyToken(word: string): string {
  let t = word;

  // multi-letter sounds first
  t = t.replace(/ksh|x/g, "ks").replace(/dny|gny|gya|gyn|gy/g, "gn");
  t = t.replace(/chh|ch/g, "c").replace(/sh/g, "s").replace(/ph/g, "p").replace(/bh/g, "b");
  t = t.replace(/dh/g, "d").replace(/th/g, "t").replace(/kh/g, "k").replace(/gh/g, "g").replace(/jh/g, "j");

  // the Marathi suffix गाव is written "gaon" in English but "gav" phonetically (Talegaon / Talegav)
  t = t.replace(/aon/g, "av");

  // single-letter equivalents
  t = t.replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k").replace(/f/g, "p");

  // vowel spellings: long/short, ai/ay/ei, and the e/i, o/u wobble (Patel/Patil, More/Moore)
  t = t.replace(/aa/g, "a").replace(/ee|ii/g, "i").replace(/oo|uu/g, "u");
  t = t.replace(/ay|ai|ei|ey/g, "i").replace(/e/g, "i").replace(/o/g, "u");

  // 'a' (the inherent vowel) is the least reliable letter across spellings; stray 'h' is usually silent
  t = t.replace(/a/g, "").replace(/h/g, "");

  // collapse doubled letters (Mehta / Mehtta)
  return t.replace(/(.)\1+/g, "$1");
}

/** "Rajesh Mehta" → "rjis mit" — compare keys, not the names themselves. */
export function phoneticKey(latin: string): string {
  return latin
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(keyToken)
    .filter(Boolean)
    .join(" ");
}

const PHONETIC_CAP = 0.92;

/** Person-name similarity that tolerates spelling variants. Never returns more than 0.92. */
export function matchOwnerNamePhonetic(a: string | null | undefined, b: string | null | undefined): number {
  const exact = matchOwnerName(a, b);
  const ka = phoneticKey(a ?? "");
  const kb = phoneticKey(b ?? "");
  if (!ka || !kb) return exact;
  return Math.max(Math.min(exact, PHONETIC_CAP), Math.min(matchOwnerName(ka, kb), PHONETIC_CAP));
}

/** Place-name similarity that tolerates spelling variants. Never returns more than 0.92. */
export function matchVillagePhonetic(a: string | null | undefined, b: string | null | undefined): number {
  const exact = matchVillage(a, b);
  const ka = phoneticKey(a ?? "");
  const kb = phoneticKey(b ?? "");
  if (!ka || !kb) return exact;
  return Math.max(Math.min(exact, PHONETIC_CAP), Math.min(matchVillage(ka, kb), PHONETIC_CAP));
}
