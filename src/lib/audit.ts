// src/lib/audit.ts
//
// Append-only record of who did what (logins, uploads, match decisions, user changes…), shown on
// the Admin → Audit trail tab. Writing an audit entry must never break the action it describes,
// so failures are logged and swallowed.

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string; // e.g. "document.upload"
  resourceType: string; // e.g. "document"
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry, request?: NextRequest): Promise<void> {
  try {
    const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        ipAddress: forwarded || request?.headers.get("x-real-ip") || null,
        userAgent: request?.headers.get("user-agent") ?? null,
        metadata: JSON.stringify(entry.metadata ?? {}),
      },
    });
  } catch (err) {
    console.warn("[audit] could not record", entry.action, (err as Error)?.message || err);
  }
}
