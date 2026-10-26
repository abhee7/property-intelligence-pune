#!/bin/sh
# One-shot setup run by the `init` service in docker-compose.yml before the app starts.
# Idempotent: safe to run on every `docker compose up` — it only does work that is missing.
#
#   INIT_DATASET=0   skip the Pune dataset (base demo data only, much faster)

set -e

echo ""
echo "PropIntel — preparing the database in ${DATABASE_URL}"

# 1. Create / update the tables
npx prisma db push --skip-generate

# helper: run one SQL count against the SQLite file
count() {
  node -e "
    const Database = require('better-sqlite3');
    const file = process.env.DATABASE_URL.replace(/^file:/, '');
    try { console.log(new Database(file, { readonly: true }).prepare(process.argv[1]).get().c); }
    catch { console.log(0); }
  " "$1"
}

# 2. Users, roles, document types, ... (only on an empty database)
if [ "$(count 'select count(*) c from Tenant')" = "0" ]; then
  echo "Seeding demo users and reference data…"
  npm run db:seed
else
  echo "Database already seeded — skipping."
fi

# 3. The Pune dataset, then sample documents run through the real OCR (about 2 minutes, once).
#    Each step checks for ITS OWN result, so a run that failed half-way is finished on the next
#    `docker compose up` instead of being mistaken for complete.
if [ "${INIT_DATASET:-1}" = "1" ]; then
  if [ ! -f data/pune-real-estate/listings.csv ]; then
    echo "data/pune-real-estate/listings.csv not found — skipping the dataset."
  else
    if [ "$(count "select count(*) c from Property where id like 'pune-%'")" = "0" ]; then
      echo "Importing the Pune dataset…"
      npm run dataset:import -- --no-backup
    else
      echo "Pune dataset already imported — skipping."
    fi

    # Always run: the generator skips every property that already has documents, so when everything
    # is in place this costs a few seconds, and a run that died half-way is completed.
    echo "Making sure the sample documents are in place (reads any that are missing with OCR)…"
    npm run dataset:documents
  fi
else
  echo "INIT_DATASET=0 — skipping the dataset."
fi

echo "Ready."
