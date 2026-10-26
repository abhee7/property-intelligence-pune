// Has Claude write the risk narrative for the highest-risk properties.
//
//   npm run risk:narratives                    → shows the plan and cost estimate, spends nothing
//   npm run risk:narratives -- --yes           → does it (default: top 20)
//   npm run risk:narratives -- --limit 50 --yes
//
// A property whose data hasn't changed since its last Claude narrative is skipped (no call).

import { prisma } from "../src/lib/db/client";
import { getAiConfig, getAiUsage } from "../src/lib/ai/claude";
import { computeAndSaveRisk, waitForRiskIdle } from "../src/modules/risk/risk.service";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 20;
const EST_USD_PER_NARRATIVE = 0.03; // ~1.5k input + ~1k output tokens at Opus 5.5 list prices (estimate)

async function main() {
  const cfg = getAiConfig();
  if (!cfg.configured) {
    console.log("No Claude credential found — add ANTHROPIC_API_KEY to .env first.");
    process.exit(1);
  }
  if (!(limit > 0)) throw new Error("--limit must be a positive number");

  const targets: { propertyId: string; tenantId: string; overallScore: number; narrativeSource: string; property: { title: string } }[] = await prisma.riskScore.findMany({
    where: { property: { deletedAt: null } },
    orderBy: { overallScore: "desc" },
    take: limit,
    select: { propertyId: true, tenantId: true, overallScore: true, narrativeSource: true, property: { select: { title: true } } },
  });

  const todo = targets.filter((t) => t.narrativeSource !== "ai"); // quick pre-filter; unchanged data is also skipped inside
  console.log(`\nTop ${targets.length} properties by risk · ${todo.length} without a Claude narrative · model ${cfg.model}`);
  console.log(`Estimated cost: ≈ $${(todo.length * EST_USD_PER_NARRATIVE).toFixed(2)} (rough estimate at Opus 5.5 list prices)\n`);

  if (!flag("yes")) {
    console.log("Nothing was sent. Re-run with --yes to generate them.\n");
    await prisma.$disconnect();
    process.exit(0);
  }

  let done = 0;
  let failed = 0;
  for (const t of targets) {
    const r = await computeAndSaveRisk(t.tenantId, t.propertyId, { trigger: "manual" });
    const s = r?.narrativeStatus;
    if (s?.source === "ai") { done++; console.log(`  ✓ ${String(t.overallScore).padStart(3)}  ${t.property.title}`); }
    else if (s?.source === "kept") console.log(`  = ${String(t.overallScore).padStart(3)}  ${t.property.title} (unchanged, kept)`);
    else { failed++; console.log(`  ✗ ${String(t.overallScore).padStart(3)}  ${t.property.title} — ${s?.reason ?? "no narrative"}`); }
    if (s?.kind === "auth" || s?.kind === "rate_limit") { console.log("\nStopping: the API rejected the key or is rate limiting."); break; }
  }

  await waitForRiskIdle();
  const u = getAiUsage();
  console.log(`\n${done} written, ${failed} failed · ${u.calls} calls · ${u.inputTokens} in / ${u.outputTokens} out tokens · ≈ $${((u.inputTokens * 4 + u.outputTokens * 20) / 1e6).toFixed(3)}\n`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
