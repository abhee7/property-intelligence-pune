# PropIntel — viva preparation

Short, honest answers to the questions an examiner is most likely to ask. Each answer is something you can point to in the code or the running app. Read the **"say this first"** box before anything else.

> **Say this first.** The data is real *listings* plus a *generated* legal layer (survey numbers, owners, court cases, news, sample documents). The AI features have been run live against Google's Gemini API (`gemini-3.5-flash-lite`), but the Claude path has not been run against the live API. Examiners reward a team that says this before being asked far more than one that is caught out.

---

## 1. The idea

**What problem does it solve?**
Property fraud (duplicate listings, one plot claimed by two owners, a document that belongs to another property, a title frozen by a court stay order) is visible only when pieces of information are *compared*. That comparison is manual and spread across portals. PropIntel automates it and shows its reasoning.

**Who uses it?** Agency admins, brokers and land owners; a platform admin manages users and audit. Each agency's data is isolated by tenant.

**Why Pune / Maharashtra?** The 7/12 extract and Marathi documents are specific to Maharashtra; the dataset is Pune listings.

**Is it a legal opinion?** No. It is decision support: every output is a prompt for human review.

## 2. The data

**Where does the data come from?**
930 real Pune listings from a public Kaggle dataset (title, locality, area, price, BHK, society). Everything else is generated and marked synthetic in each property's metadata: survey numbers, owners, brokers, coordinates, court cases, news, and the sample documents.

**Why generate it?** There is no public API for land records or court cases, and real personal data would need consent. A seeded scenario planner adds the situations the system must detect (8 re-listings, 6 ownership conflicts, 120 court cases, wrong-owner and wrong-property documents).

**Are the verdicts hard-coded?** No. The sample documents go through the real upload and OCR path; verdicts are computed.

**Why 944 properties from 930 rows?** Re-listings and the second claim of each conflict pair are added on purpose.

## 3. OCR and documents

**Which OCR?** Tesseract through tesseract.js (WebAssembly), so it runs offline in Node. English first; if confidence is below 80 it re-reads with English + Marathi and keeps the better result. Images are cleaned with *sharp* first (median filter, normalisation).

**Why not render PDF pages to an image?** It crashed Node on some files. For a scanned PDF the embedded page image is extracted instead.

**What if the scan is bad?** Below 65% OCR confidence, partial and mismatch results become *unverifiable* and the document is flagged for review. A misread digit must not become an accusation.

**How accurate is it?** About 93–94% confidence on the generated clean pages; degraded scans fall to ~55–60% and go to review. *Be careful:* generated pages are cleaner than real scans, and confidence is not accuracy. Say so.

## 4. Matching

**How are duplicates found?** Every pair is scored on survey number 35%, owner 25%, village 15%, area 10%, price 5%, coordinates 10%.

**Why is the survey number special?** It is the legal identifier. If both are known and differ, the pair is not a match; only a trailing sub-division letter (118/2A vs 118/2) or an OCR confusion is tolerated. An early version matched by substring (9/13 matched 389/13B) — that was a bug found by testing.

**What is an ownership conflict?** Same survey number and village, different known owners.

**Who decides?** A person. Confirm / Dismiss is stored with who and when; a confirmed duplicate or conflict sets a risk floor of 65.

## 5. Risk score

**How is it computed?** Five factors scored 0–100 — title clarity 30%, legal exposure 25%, document authenticity 20%, ownership stability 15%, news sentiment 10% — weighted and summed; plus an unverified penalty of up to +15; then hard floors: stay order ≥ 60, fraud case ≥ 70, confirmed duplicate/conflict ≥ 65. Levels: Minimal 0–15, Low 16–35, Moderate 36–55, High 56–75, Critical 76+.

**Why is almost everything Moderate?** 862 of 944 have no verified documents and the engine treats *unverified* as a risk in itself (+15). Uploading documents is what moves a property. It follows from the design, not from the data.

**Why hard floors?** Some facts must dominate: a court stay order blocks any transfer, however clean the paperwork.

**Is the score machine learning?** No. It is a transparent weighted rule set. That is deliberate: every point carries evidence a person can challenge. There is no labelled outcome data to train on.

**How do you know the weights are right?** We don't claim they are validated. They are reasonable, tenant-overridable defaults; calibrating them against real outcomes is future work.

## 6. Marathi names

**How do you compare a Marathi 7/12 with an English record?**
(1) Rule-based Devanagari→Latin transliteration with schwa deletion (offline). (2) Optionally an AI model (Gemini or Claude) spells the name the ways a person would write it (cached). (3) A phonetic matcher compares every pair of candidate spellings, capped at 0.92.

**What happens when the names look different?** With the AI model's spellings, a score below 0.5 is a *mismatch*. With rules alone it is *unverifiable* ("verify manually"), because a rule-based reading cannot prove two names are different people. This asymmetry is the key design choice.

**How well does it work?** All 56 names and places in our regression set score ≥ 0.8 against their usual English spelling; different people score low; two people sharing only a first name come out *partial*. *Limit:* it is a hand-chosen list, not an accuracy rate.

**Why not just ask the AI model to compare the names?** Then the model would be deciding identity. It only *spells*; our matcher judges.

## 7. AI features

**Which AI do you use?** Either Google Gemini or Anthropic Claude, chosen by whichever key is in `.env` (`AI_PROVIDER` can force one). Both go through one provider layer and return the same result type, so the features don't depend on which one answers.

**What does the AI do?** Three things: writes a plain-English risk explanation, re-reads a poor scan, and spells Marathi names. All optional, off without a key.

**What does it never do?** Change a score, decide a field value, or decide whether two people are the same.

**How do you stop it making things up?** Structured outputs (a schema); any number in a narrative must appear in the input data or the text is discarded; name spellings must be plain Latin letters; document text is treated as untrusted data in the prompt.

**Has it been tested on the real API?** **Gemini: yes.** `npm run ai:check` against the live Gemini API (`gemini-3.5-flash-lite`) produced a grounded narrative for the 82/Critical property in 1.3 s, read a degraded Marathi 7/12 with 4 of 4 fields correct, and spelled *ज्ञानेश्वर लोखंडे* and *हिंजवडी* correctly (score 0.92 against the usual spellings). **Claude: no** — only unit tests with a fake client and a local stand-in that speaks the real wire format; `npm run ai:check` checks it with an Anthropic key. Say both parts.

**Did anything go wrong in the live test?** Yes, and it is a good story: the first default model (`gemini-2.5-flash`) was refused as "no longer available to new users", and the bigger models were slow or overloaded. The default became `gemini-3.5-flash-lite`, the error now tells you to set `GEMINI_MODEL`, and a test covers it. Model names are not permanent.

**Is it safe to send real documents to a free AI tier?** Not without reading the terms: some free tiers may use submitted content to improve products. The demo uses only sample data.

**What if the API is down?** Rule-based narrative, Tesseract's reading and rule-based transliteration are used; nothing fails.

## 8. Architecture and engineering

**Why Next.js + SQLite?** One TypeScript codebase for UI and API; SQLite needs no setup, so the project installs with one command. For many concurrent users you would move to a server database (stated as future work).

**Why pure functions?** Extraction, verification, matching, scoring and transliteration have no database access, so they are tested exhaustively and behave identically everywhere. 435 automated tests.

**How do you handle SQLite's single writer?** Risk updates run through a serialising queue; the slow AI call is made outside the queue.

**Is it secure?** Passwords hashed with bcrypt; JWT access/refresh tokens; login rate limiting; role and permission checks; every query scoped by tenant; Zod validation on input; an audit trail. *Admit:* it is a prototype — no penetration testing, SQLite instead of a hardened database.

**How is it reproducible?** `bash scripts/setup.sh` or Docker. The dataset, sample documents and base seed use seeded random generators; a fresh clone was compared with the main database and was identical.

## 9. Honest limits (volunteer these)

- No live external data (no official API exists for court or land records).
- Survey numbers, owners and the legal layer are generated.
- The Claude path is untested on the live API (the Gemini path was tested live).
- OCR measured on generated pages, not real scans.
- Alerts are in-app only; no email/SMS/WhatsApp provider.
- Name matching is by sound and tested on a chosen list.

## 10. Questions designed to catch you out

**"88 documents but fewer properties — why?"** 43 properties have sample documents; the clean ones get a 7/12, a title deed and sometimes an encumbrance certificate, so one property can have two or three.

**"What did you find wrong with your own project?"** (Strong answer.) Screens that still showed hardcoded demo data (dashboard donut totalled 84 on 944 properties), an audit log nothing wrote to, a user-update endpoint that wasn't tenant-scoped, a map showing only the first 100 properties, and a demo that differed on every install because the seed used unseeded random names. All fixed and covered by tests or a fresh-clone comparison.

**"What would you do with another month?"** Measure OCR and name matching on genuine scans (with consent); connect one real data source; add email/WhatsApp alerts.

**"How is this different from a Google search?"** Search finds pages. PropIntel reads *your* documents, compares them with the record and with every other property, and gives a scored, explained answer.

---

## Demo checklist (3 minutes)

1. `npm run dev`; sign in as `manager@sahyadri-demo.com` / `Demo@12345`.
2. Dashboard → point at 944 / 42 high-risk / 71 cases.
3. Risk Analysis → open the top property → AI Risk Intelligence tab → read the stay-order banner and one factor's evidence.
4. Matching → Conflicts → expand one.
5. Document Verification → upload the four files from `demo-docs/` to *3 BHK Flat in Acolade, Kharadi* → open each.
6. Back to the property: score 46 → 29.
7. Say the three honest limits.

Full script with exact expected values: `DEMO.md`.
