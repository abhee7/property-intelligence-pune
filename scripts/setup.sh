#!/usr/bin/env bash
# scripts/setup.sh — first-time setup for PropIntel
#
#   bash scripts/setup.sh                 full setup incl. the Pune dataset and sample documents
#   bash scripts/setup.sh --no-dataset    base demo data only (skips the dataset and OCR of sample docs)
#
# Safe to re-run: it only seeds an empty database.

set -e

WITH_DATASET=1
for arg in "$@"; do [ "$arg" = "--no-dataset" ] && WITH_DATASET=0; done

echo ""
echo "PropIntel — setup"
echo "================="

# ─── Prerequisites ───
command -v node >/dev/null 2>&1 || { echo "Node.js 18+ is required: https://nodejs.org"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "npm is required."; exit 1; }

NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_MAJOR" -lt 18 ] && { echo "Node.js 18+ required (found $(node -v))"; exit 1; }
echo "  node $(node -v), npm $(npm -v)"

# ─── Dependencies ───
echo ""
echo "Installing dependencies…"
npm install

# ─── Environment (Prisma reads .env) ───
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  created .env from .env.example"
else
  echo "  .env already exists — left untouched"
fi

# ─── Database ───
echo ""
echo "Preparing the database…"
npx prisma generate
npx prisma db push

TENANTS=$(node -e "
const D=require('better-sqlite3');
try{console.log(new D('prisma/dev.db').prepare('select count(*) c from Tenant').get().c)}catch{console.log(0)}")
if [ "$TENANTS" = "0" ]; then
  echo "Seeding demo users, roles and document types…"
  npm run db:seed
else
  echo "  database already seeded — skipping"
fi

mkdir -p uploads/documents

# ─── OCR language data (English + Marathi, ~12 MB, one-off download) ───
echo ""
echo "Downloading OCR language data…"
npm run ocr:setup || echo "  (download failed — OCR will fetch it on first use if online)"

# ─── Pune dataset + sample documents ───
if [ "$WITH_DATASET" = "1" ]; then
  if [ -f data/pune-real-estate/listings.csv ]; then
    echo ""
    echo "Importing the Pune dataset (replaces the random demo properties; backs up the DB first)…"
    npm run dataset:import
    echo ""
    echo "Generating sample documents and running them through OCR (about a minute)…"
    npm run dataset:documents
  else
    echo "  data/pune-real-estate/listings.csv not found — run: python scripts/download-pune-dataset.py"
  fi
fi

echo ""
echo "Done."
echo ""
echo "  Start:   npm run dev      → http://localhost:3000"
echo "  Test:    npm run test:run"
echo ""
echo "  Demo logins (password for all: Demo@12345)"
echo "    admin@sahyadri-demo.com     platform admin"
echo "    manager@sahyadri-demo.com   agency admin   <- use this one for the demo"
echo "    broker@sahyadri-demo.com    broker"
echo "    owner@sahyadri-demo.com     land owner"
echo ""
