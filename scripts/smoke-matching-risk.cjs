// End-to-end smoke test against a running dev server (npm run dev):
//   create a conflicting duplicate of a seeded property → matching finds it →
//   a reviewer confirms it → risk scores react → upload a document → clean up.
// Usage: node scripts/smoke-matching-risk.cjs [baseUrl]

const BASE = process.argv[2] || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token;

async function api(path, { method = "GET", body, form } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${method} ${path} → ${res.status} ${json.error}`);
  return json.data;
}

const risk = async (id) => (await api(`/api/properties/${id}`)).property.riskScore;
const show = (label, r) => console.log(`  ${label}: ${r ? `${r.overallScore} ${r.riskLevel}` : "none"}${r?.flags?.length ? "  flags=" + r.flags.map((f) => f.code).join(",") : ""}`);

async function waitFor(fn, what, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}`);
}

(async () => {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "manager@sahyadri-demo.com", password: "Demo@12345" }),
  }).then((r) => r.json());
  token = login.data.accessToken || login.data.tokens?.accessToken;

  // prop-002 = "Bungalow at Jejuri", survey 9/13, owner Rajesh Kadam
  const target = (await api("/api/properties/prop-002")).property;
  console.log(`\n1. Seeded property: ${target.title} · survey ${target.surveyNumber} · owner ${target.owner.firstName} ${target.owner.lastName}`);
  show("risk before", await risk("prop-002"));

  console.log("\n2. Create a second listing with the SAME survey number + village but a different owner");
  const created = await api("/api/properties?force=true", {
    method: "POST",
    body: {
      title: "ZZ Smoke test property",
      propertyTypeId: target.propertyType.id,
      surveyNumber: target.surveyNumber,
      areaSqft: target.areaSqft,
      ownerId: "owner-001",
      address: { line1: "Smoke test", city: "Pune", district: "Pune", state: "Maharashtra", postalCode: "412303" },
      metadata: { village: target.metadata.village, taluka: target.metadata.taluka },
    },
  });
  const newId = created.property.id;
  console.log(`  created ${newId}`);

  console.log("\n3. Matching runs automatically in the background");
  const match = await waitFor(async () => {
    const m = await api(`/api/matching?propertyId=${newId}`);
    return m.matches[0];
  }, "match to appear");
  console.log(`  ${match.matchType} · score ${match.overallScore} · status ${match.status}`);
  console.log(`  ${match.propertyA.title} (${match.propertyA.ownerName}) ⇄ ${match.propertyB.title} (${match.propertyB.ownerName})`);

  await sleep(1500);
  show("risk of prop-002 (possible conflict)", await risk("prop-002"));
  show("risk of new property", await risk(newId));

  console.log("\n4. Reviewer confirms the match");
  await api(`/api/matching/${match.id}`, { method: "PATCH", body: { action: "confirmed" } });
  await sleep(2000);
  show("risk of prop-002 (confirmed)", await risk("prop-002"));

  console.log("\n5. Reviewer dismisses it instead → risk should fall back");
  await api(`/api/matching/${match.id}`, { method: "PATCH", body: { action: "dismissed" } });
  await sleep(2000);
  show("risk of prop-002 (dismissed)", await risk("prop-002"));

  console.log("\n6. Clean up");
  await api(`/api/properties/${newId}`, { method: "DELETE" });
  console.log("  test property archived");
})().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
