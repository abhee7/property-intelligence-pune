// src/modules/admin/admin.service.ts

import { getHeapStatistics } from "node:v8";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { getProviderStatus } from "@/lib/providers/registry";

// ─── User management ───

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export async function listUsers(tenantId: string, filters: { role?: string; isActive?: boolean; q?: string; page?: number; limit?: number } = {}) {
  const where: Record<string, unknown> = { tenantId };
  if (filters.role) where.role = { name: filters.role };
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.q) {
    where.OR = [
      { firstName: { contains: filters.q } },
      { lastName: { contains: filters.q } },
      { email: { contains: filters.q } },
    ];
  }

  const page = filters.page || 1;
  const limit = filters.limit || 20;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: where as any,
      include: { role: { select: { name: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where: where as any }),
  ]);

  return {
    users: users.map((u: any) => ({
      id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
      phone: u.phone, role: u.role.name, roleDisplay: u.role.displayName,
      isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    })),
    total,
  };
}

export async function createUser(tenantId: string, data: { email: string; firstName: string; lastName: string; phone?: string; role: string; password: string }) {
  const roleRecord = await prisma.role.findUnique({ where: { name: data.role } });
  if (!roleRecord) throw new Error("Invalid role");

  const existing = await prisma.user.findFirst({ where: { email: data.email } });
  if (existing) throw new Error("Email already exists");

  const passwordHash = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      tenantId,
      roleId: roleRecord.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      passwordHash,
      isActive: true,
    },
  });
}

// Both are scoped to the caller's tenant: an admin must never be able to change another tenant's users.
export async function updateUserStatus(tenantId: string, userId: string, isActive: boolean) {
  const { count } = await prisma.user.updateMany({ where: { id: userId, tenantId }, data: { isActive } });
  if (count === 0) throw new Error("User not found");
}

export async function updateUserRole(tenantId: string, userId: string, roleName: string) {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw new Error("Invalid role");
  const { count } = await prisma.user.updateMany({ where: { id: userId, tenantId }, data: { roleId: role.id } });
  if (count === 0) throw new Error("User not found");
}

// ─── System health ───

export interface SystemHealth {
  status: "healthy" | "degraded" | "down";
  uptime: string;
  database: { status: string; latencyMs: number };
  providers: Record<string, { provider: string; type: string }>;
  memory: { used: string; total: string; percent: number };
  counts: { users: number; properties: number; documents: number; notifications: number };
  recentErrors: { time: string; service: string; message: string }[];
}

export async function getSystemHealth(tenantId: string): Promise<SystemHealth> {
  const dbStart = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbLatency = Date.now() - dbStart;

  const [userCount, propCount, docCount, notifCount] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.property.count({ where: { tenantId, deletedAt: null } }),
    prisma.document.count({ where: { deletedAt: null } }),
    prisma.notification.count({ where: { tenantId } }),
  ]);

  // heapUsed can exceed heapTotal (large objects live outside it), so report against V8's heap limit instead
  const heapUsed = process.memoryUsage().heapUsed;
  const heapLimit = getHeapStatistics().heap_size_limit;

  return {
    status: dbLatency < 100 ? "healthy" : dbLatency < 500 ? "degraded" : "down",
    uptime: formatUptime(process.uptime()),
    database: { status: dbLatency < 100 ? "connected" : "slow", latencyMs: dbLatency },
    providers: getProviderStatus(),
    memory: {
      used: formatBytes(heapUsed),
      total: formatBytes(heapLimit),
      percent: Math.round((heapUsed / heapLimit) * 100),
    },
    counts: { users: userCount, properties: propCount, documents: docCount, notifications: notifCount },
    recentErrors: await getRecentProblems(tenantId),
  };
}

/** Documents the OCR pipeline couldn't read, or wasn't confident about — the real "recent problems". */
async function getRecentProblems(tenantId: string): Promise<SystemHealth["recentErrors"]> {
  const docs: { originalName: string; ocrStatus: string; ocrError: string | null; ocrConfidence: number | null; processedAt: Date | null }[] =
    await prisma.document.findMany({
      where: { property: { tenantId }, deletedAt: null, ocrStatus: { in: ["FAILED", "REQUIRES_REVIEW"] } },
      orderBy: { processedAt: "desc" },
      take: 8,
      select: { originalName: true, ocrStatus: true, ocrError: true, ocrConfidence: true, processedAt: true },
    });
  return docs.map((d) => ({
    time: d.processedAt ? d.processedAt.toISOString() : "",
    service: "OCR processor",
    message:
      d.ocrStatus === "FAILED"
        ? `${d.originalName}: ${d.ocrError || "could not be read"}`
        : `${d.originalName}: needs manual review${d.ocrConfidence != null ? ` (OCR confidence ${Math.round(d.ocrConfidence)}%)` : ""}`,
  }));
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// ─── Audit logs ───

export async function getAuditLogs(tenantId: string, filters: { userId?: string; action?: string; page?: number; limit?: number } = {}) {
  const where: Record<string, unknown> = { tenantId };
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = { contains: filters.action };

  const page = filters.page || 1;
  const limit = filters.limit || 30;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where: where as any }),
  ]);

  // AuditLog has no relation to User, so look the people up separately
  const userIds = [...new Set(rows.map((r: any) => r.userId).filter(Boolean))] as string[];
  const people: { id: string; firstName: string; lastName: string; email: string }[] = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    : [];
  const byId = new Map(people.map((u) => [u.id, u]));

  const logs = rows.map((r: any) => ({ ...r, user: r.userId ? byId.get(r.userId) ?? null : null }));
  return { logs, total };
}
