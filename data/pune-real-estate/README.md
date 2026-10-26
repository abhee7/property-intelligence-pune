# Pune real-estate dataset

`listings.csv` — 930 property listings scraped from a Pune real-estate portal.

- **Source:** Kaggle, `shubham001official/pune-real-estate-listings-dataset`
  (https://www.kaggle.com/datasets/shubham001official/pune-real-estate-listings-dataset)
- **Re-download:** `python scripts/download-pune-dataset.py` (`pip install kagglehub`; no login needed)
- **Licence:** not recorded here — check the licence on the Kaggle page before redistributing the file.

## What is real, and what is generated

PropIntel needs legal-record fields that a listings site doesn't have. `npm run dataset:import`
keeps the two clearly apart (every generated field is also listed in each property's
`metadata.synthetic`).

| Real (from the CSV) | Generated (deterministic, seeded) |
|---|---|
| Title, BHK, property kind, society, locality | Survey numbers (unique within a village) |
| Price, carpet / super area, rate per sq ft | Owners and brokers (from the seeded users) |
| Floor, facing, furnishing, ownership type | Map coordinates = locality centre ± ~400 m |
| Parking, bathrooms, balconies, possession date | PIN codes (approximate, per locality) |
| | Court cases, hearings, stay orders |
| | Duplicate / ownership-conflict records and sample documents |

Localities map to talukas and approximate centres in `src/modules/dataset/pune-dataset.ts`.
Listings whose locality isn't in that table fall back to the Pune centre (`metadata.localityApprox`).

## Scenarios built in (so every feature has something to show)

| Scenario | Count | What it demonstrates |
|---|---|---|
| Listings the scraper saw twice | 5 | Duplicate detection on real data |
| Same flat re-listed by another broker | 8 | Exact-duplicate matches |
| Same survey number claimed by a different owner | 6 | Ownership-conflict matches |
| Properties with court cases | ~120 cases | Legal-exposure score, stay-order and fraud floors |
| Properties with sample documents | 43 (88 documents) | OCR, verification, document-authenticity score |

Document scenarios: clean (24), owner mismatch (7), area mismatch (5), wrong property (4), wrong document type (3).

Same seed → same output. `npm run dataset:import -- --seed 7` gives a different but reproducible synthetic layer.

## Known quirks in the source data

- A few listings have implausible areas (e.g. 100 sq ft) — kept as-is, since they are the source's values.
- Titles are listing headlines; society and locality are parsed from them (`parseTitle`).
