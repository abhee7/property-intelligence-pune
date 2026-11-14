# PropIntel — Demo Script

A 10–12 minute walkthrough for a viva or presentation. Every property, number and file named
below exists in the database after `bash scripts/setup.sh` — nothing here needs improvising.

**The story in one sentence:** *"Buying land in India is risky because the paperwork is scattered and
hard to verify. PropIntel reads the documents, cross-checks them against the record, finds duplicate
and conflicting listings, adds court cases and news, and gives one explainable risk score."*

---

## Before you start (2 minutes)

```bash
npm run dev                          # terminal 1 — leave running
npm run demo:docs -- --reset         # terminal 2 — puts the live-demo property back to its starting state
npm run demo:docs                    # (re)creates the files in demo-docs/ (3 English + 1 Marathi)
```

- Open <http://localhost:3000> and sign in with **`manager@sahyadri-demo.com` / `Demo@12345`**
  (the **Manager** button on the login page does this).
- Have the `demo-docs/` folder open in a file explorer, ready to drag files from.
- Browser zoom ~90% and sidebar visible works well on a projector.
- Optional safety net: keep the numbers in the *"If something goes wrong"* table at the bottom.

---

## Scene 1 — The portfolio (1 min) · **Dashboard**

> "This is a portfolio of **944 Pune properties** — real listings from a public dataset."

- Point at: **944 total**, **24 verified (3%)**, **42 high-risk**, **71 active court cases**. Every card and chart on this page is computed from the database — the risk donut totals 944 and matches the Risk Analysis page.
- Say: *"Only 3% are verified because verification needs documents — most listings have none yet.
  PropIntel treats 'unverified' as a risk in itself, not as safe."*

## Scene 2 — Find a property (1 min) · **Properties**

- Type **`Kharadi`** in search → results filter instantly across all 944.
- Switch **Table / Grid**, then use the **Risk level** filter → *Critical*. Six properties.
- Say: *"Search and filters cover the whole portfolio; the risk badge on each row is computed, not typed in."*

## Scene 3 — Why is a property risky? (2 min) · **Risk Analysis → one property**

1. Open **Risk Analysis**. Point at the distribution (Minimal 20 · Low 20 · Moderate 862 · High 36 · Critical 6) and the factor-weights cards.
2. Click **Inspect** on the top row: **4 BHK Flat in Panchshil Eon Waterfront, Kharadi — 82, CRITICAL**.
3. Open the **AI Risk Intelligence** tab and walk down it:
   - **Red banner:** *Stay order in force (RCA/1623/2023)* — a court has frozen transfer of this property.
   - **Summary:** names the main concerns and what's not yet verified.
   - **Factor bars with evidence:** *Legal exposure* cites the active boundary-dispute case; *Title clarity* says *no 7/12 or title deed on file* and *court order restricts transfer of title*.
4. Say: *"Every point of the score has a reason you can read. And the stay order forces a minimum of 60 — no
   amount of clean paperwork could hide it."*
5. Open the **Legal & Court Cases** tab → the case number, court, hearing date.

> Second example if asked: **2 BHK Apartment in R7 LIFE REPUBLIC, Hinjawadi — 79** has a fraud case *and* a stay order.

> **Optional, if a Gemini or Claude API key is configured:** on this same tab press **Explain with AI**. After a few seconds the
> *Summary* box shows a purple **Written by AI** badge and a plain-English explanation with suggested next steps,
> built only from the evidence listed below it. Say: *"The AI model doesn't score anything — the rules do. It only explains the
> result, and any number it writes that isn't in the report is rejected."* (Run `npm run risk:narratives -- --yes` beforehand
> to have the top 20 ready, so you don't wait on the live call.)

## Scene 4 — Duplicates and conflicts (2 min) · **Matching**

> "Fraud in land deals often looks like the same plot listed twice, or one plot claimed by two owners."

- Point at the header: **34 candidates — 14 exact duplicates, 6 ownership conflicts, 14 possible matches.**
- Click the **Conflicts** chip. Expand **2 BHK Apartment in Regency Astra, Baner** (score 76):
  *same survey number 363/2 and village, but owners **Nitin More** vs **Sachin Jadhav***.
  Show the six-factor breakdown (survey number 35%, owner 25% …).
- Click the **Duplicates** chip. Expand **3 BHK Flat in Ekta California, NIBM Road** vs its *(relisted)* copy —
  score 100: same survey number, owner, area, location; different broker.
- Say: *"Survey numbers are only unique within a village, so the engine ignores matches across villages.
  And these are suggestions for a human — Confirm or Dismiss is the reviewer's call."*
- *(Optional — changes data, see "Resetting")*: **Confirm Match** on one, then open that property's risk tab:
  the score jumps (confirmed duplicate → minimum 65).

## Scene 5 — Documents the system has already read (2 min) · **Document Verification**

> "88 documents have been through the OCR pipeline. Three cases worth looking at."

Click a row → **Details** panel (extracted fields, comparison with the record, raw OCR text).

| Search for | What it shows |
|---|---|
| **`pune-0053`** (3 BHK, Godrej Aqua Vista, Mundhwa) | A 7/12 whose **owner name ≠ the record** → red *Mismatch*. The title deed beside it verifies fine. |
| **`pune-0226`** (GKG Kings Way, Ghorpadi) | Fields match, but the yellow banner says it was *uploaded as a 7/12 but looks like a sale deed*. |
| **`pune-0420`** (Clover Acropolis, Viman Nagar) | A genuine-looking 7/12 for a **different property** — survey number and village both mismatch, and the panel names the property it actually matches (3 BHK Apartment, Prabhat Road). |

Then contrast with the good case: **4 BHK Apartment in Amanora Gateway Towers 2** — three documents, all verified, risk **9 (Minimal)**.

Say: *"Poor scans are not trusted blindly — if OCR confidence is low, a field is held back for manual
review instead of accusing the property of a mismatch."*

## Scene 6 — Live: upload and watch the score move (3 min) · **Document Verification**

> "Now a fresh property, **3 BHK Flat in Acolade, Kharadi** — currently risk **46, Moderate**, no documents."

1. Open **Properties**, search *Acolade* → open it → **AI Risk Intelligence** tab. Show **46 · MODERATE** and *"No documents uploaded — nothing to verify"*.
2. Go to **Document Verification**. In the property box type **`Acolade`** and pick *3 BHK Flat in Acolade, Kharadi — 87/20*. Document type stays **7/12 extract**.
3. Choose all three files from `demo-docs/` (multi-select) → **Upload & scan**.
   They show *Queued → Scanning…* and finish in a few seconds.
4. Open each (**Details**):

   | File | Expected result | Say |
   |---|---|---|
   | `1_7-12_CORRECT.png` | **Verified**, ~93% — survey **87/20**, owner **Nitin More**, village Kharadi, **1,400 sq ft** all match | "Read from an image, compared field by field." |
   | `2_7-12_WRONG-OWNER.png` | **Discrepancies** — owner is *Meena Patil*, record says *Nitin More* → red *Mismatch* | "Someone presenting a 7/12 in the wrong name." |
   | `3_SALE-DEED_uploaded-as-7-12.png` | Fields match but **yellow warning: looks like a sale deed** | "Wrong document type is caught too." |
   | `4_7-12_MARATHI.png` *(optional, add it to the multi-select)* | **Verified** — owner `नितीन मोरे` and village `खराडी` are read in Devanagari and matched to *Nitin More* / *Kharadi*; the owner row shows *"Read as Nitin More · rule-based"* | "A real Marathi 7/12, compared with the English record." |

5. Back to the property → risk tab → press **Recalculate** if it hasn't refreshed. The score is now **29 · LOW**
   (down from 46: a verified 7/12 is on file), but a **"Owner or survey number in a document differs"** flag remains
   because of file 2, and the summary says *Not yet verified: Title deed, Encumbrance certificate*.
6. Say: *"That's the whole loop — upload, OCR, verify, score — and the score recalculated by itself."*

## Scene 7 — The map and analytics (1 min)

- **Property Map:** pins across Pune coloured by risk; click a red one → side panel → *Open full intelligence report*.
- **Analytics:** risk distribution, busiest localities, litigation by case type, the **document pipeline** card
  (88 documents, average OCR confidence and scan time), and the CSV export.
- Say: *"All of these are computed from the database — nothing is hard-coded."*

---

## Closing (30 seconds)

> "PropIntel turns scattered paperwork into one explainable number. The OCR, verification, matching and risk
> engine are real and tested — 290+ automated tests. What's prototype: the court, land-record and news feeds
> are a seeded data set rather than live government APIs — those don't have open APIs, so the next step is
> a provider integration."

## Likely questions

| Question | Answer |
|---|---|
| **Is the data real?** | The 930 listings (price, area, society, locality…) are real, from a public Kaggle dataset. Survey numbers, owners, coordinates and court cases are **generated** to make the legal features demonstrable — and tagged as such in the data. |
| **How accurate is the OCR?** | ~93–94% confidence on clean scans. Degraded scans drop to ~55–60% and are sent to manual review rather than trusted. English first, Marathi as a fallback. |
| **Does it use AI / an LLM?** | Deliberately only where it helps. Scoring and matching are transparent rules — every score is explainable. An AI model (Gemini or Claude) is an *optional* layer: it writes the plain-English summary (checked so it can't state a number that isn't in the report) and re-reads scans Tesseract can't (only when Tesseract is unsure). With no API key everything still works. |
| **What data goes to the AI model?** | Summaries: only the property title, locality, status and the computed score/evidence — no owner names or contact details. Scan reading: the document image/PDF itself, so it's switchable (`AI_SCAN_READING=off`). |
| **Can the AI make a mistake in a summary?** | It's constrained: it only sees the computed report, every number it writes is checked against that report, and a failed check discards its text and shows the rule-based one. It's labelled "Written by AI" so a reader always knows. |
| **Why is almost everything "Moderate"?** | Because 862 properties have no verified documents, and the engine counts "unverified" as +15 risk. Uploading documents is what moves them. |
| **Why can't I just trust the OCR?** | You can't — so it never decides alone: low-confidence fields are held back, and matches/mismatches are suggestions for a human reviewer. |
| **What about Marathi owner names?** | They're transliterated (offline rules, plus the AI model's spellings if a key is set) and compared by sound. A weak match without the AI model is shown as *can't confirm — verify manually*, not as an accusation; with Claude's spellings it can be a real mismatch. |
| **Can it scale?** | It's a single-process prototype on SQLite. The scoring is pure functions and the data layer is isolated, so moving to PostgreSQL + a job queue is a contained change. |

## If something goes wrong

| Symptom | Quick fix |
|---|---|
| Upload stuck on *Scanning…* | Wait ~10 s (first OCR of a session loads the model). Open **Details** → **Re-run OCR**. |
| Scores don't update after upload | Property → AI Risk Intelligence → **Recalculate**. |
| Port 3000 busy / blank page | Stop other servers; `npm run dev` again. Sign in again after a restart. |
| Live demo already used | `npm run demo:docs -- --reset` (server running) restores the starting state. |
| No internet | Everything works offline except **map tiles** — skip Scene 7's map. |

## Resetting after the demo

- **Live upload (Scene 6):** `npm run demo:docs -- --reset`
- **Confirmed/dismissed matches (Scene 4):** they stay decided. For a pristine state, re-import
  (`npm run dataset:import && npm run dataset:documents`, ~2 minutes — it backs the database up first).

---

*Reference numbers (from the seeded dataset, seed 20260723):* 944 properties · 20 Minimal / 20 Low /
862 Moderate / 36 High / 6 Critical · 120 court cases (71 active, 9 with stay orders) · 34 match candidates
(14 exact duplicates, 6 ownership conflicts, 14 possible) · 88 documents.
