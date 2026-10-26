// src/app/api/health/route.ts
// Public endpoint — no auth required
// Used by Docker HEALTHCHECK, load balancers, and monitoring

import { getHeapStatistics } from "node:v8";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const start = Date.now();

  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // Database check
  try {
    const { prisma } = await import("@/lib/db/client");
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (err: any) {
    checks.database = { status: "error", error: err.message };
  }

  // Memory check: used heap as a share of the heap LIMIT. (heapUsed / heapTotal is not meaningful —
  // heapTotal is only what V8 has allocated so far, so the ratio is routinely >90% just after start-up
  // and would flip a healthy container to 503.)
  const mem = process.memoryUsage();
  const memPercent = Math.round((mem.heapUsed / getHeapStatistics().heap_size_limit) * 100);
  checks.memory = {
    status: memPercent < 90 ? "ok" : "warning",
    latencyMs: 0,
  };

  const allOk = Object.values(checks).every(c => c.status === "ok");

  return NextResponse.json({
    status: allOk ? "healthy" : "degraded",
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start,
    checks,
  }, {
    status: allOk ? 200 : 503,
  });
}
