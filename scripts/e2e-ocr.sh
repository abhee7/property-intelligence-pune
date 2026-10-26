#!/usr/bin/env bash
# Smoke test: login → upload sample docs to prop-002 → wait for OCR → print results.
set -e
BASE=${BASE:-http://localhost:3000}
TOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"manager@sahyadri-demo.com","password":"Demo@12345"}' | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); (j.data&&(j.data.accessToken||j.data.tokens&&j.data.tokens.accessToken))||JSON.stringify(j).slice(0,300)')
echo "token: ${TOKEN:0:25}..."
H="Authorization: Bearer $TOKEN"
curl -s $BASE/api/documents/types -H "$H" | head -c 400; echo
for f in "$@"; do
  echo "--- uploading $f"
  curl -s -X POST $BASE/api/documents -H "$H" -F propertyId=prop-002 -F documentTypeId=dt-712 -F "files=@$f" | head -c 300; echo
done
echo "--- waiting for OCR"
for i in $(seq 1 40); do
  S=$(curl -s "$BASE/api/documents?limit=50" -H "$H" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); j.data.documents.filter(d=>["PENDING","PROCESSING"].includes(d.ocrStatus)).length')
  [ "$S" = "0" ] && break; sleep 3
done
curl -s "$BASE/api/documents?limit=50" -H "$H" | node -e '
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
for (const d of j.data.documents) {
  console.log("\n#", d.originalName, "|", d.ocrStatus, "| conf", d.ocrConfidence&&d.ocrConfidence.toFixed(0), d.ocrError||"");
  if (d.extracted) {
    console.log("  fields:", JSON.stringify(d.extracted.fields));
    console.log("  verification:", d.extracted.verification.overall, d.extracted.verification.checks.map(c=>c.field+"="+c.status).join(", "), d.extracted.verification.kindMismatch?JSON.stringify(d.extracted.verification.kindMismatch):"");
  }
}'
