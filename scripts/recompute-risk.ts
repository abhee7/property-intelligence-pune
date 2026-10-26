// Re-scores every property from the real data (court cases, news, documents, matches).
// Usage: npm run risk:recompute            → all tenants
//        npm run risk:recompute -- <tenantId>

import { prisma } from "../src/lib/db/client";
import { runPropertyMatching } from "../src/modules/matching/matching.service";
import { recomputeAllRisk, waitForRiskIdle } from "../src/modules/risk/risk.service";

async function main() {
  const only = process.argv[2];
  const tenants: { id: string; name: string }[] = await prisma.tenant.findMany({
    where: only ? { id: only } : {},
    select: { id: true, name: true },
  });
  if (!tenants.length) throw new Error("No tenant found");

  for (const t of tenants) {
    console.log(`\n${t.name} (${t.id})`);

    const m = await runPropertyMatching(t.id);
    console.log(`  matching: ${m.scanned} pairs checked → ${m.created} new, ${m.updated} refreshed, ${m.removed} removed`);

    const r = await recomputeAllRisk(t.id);
    console.log(`  risk: ${r.updated} properties scored in ${r.durationMs} ms${r.failed ? `, ${r.failed} FAILED` : ""}`);
    console.log("  levels:", r.byLevel);
  }
  await waitForRiskIdle();
  await prisma.$disconnect();
  // debounced refreshes started by the matching run would only repeat the work just done
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
