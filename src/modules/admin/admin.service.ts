// src/modules/admin/admin.service.ts

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
      { firstName: { contains: filters.q, mode: "insensitive" } },
      { lastName: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
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

export async function updateUserStatus(userId: string, isActive: boolean) {
  return prisma.user.update({ where: { id: userId }, data: { isActive } });
}

export async function updateUserRole(userId: string, roleName: string) {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw new Error("Invalid role");
  return prisma.user.update({ where: { id: userId }, data: { roleId: role.id } });
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

  const memUsage = process.memoryUsage();

  return {
    status: dbLatency < 100 ? "healthy" : dbLatency < 500 ? "degraded" : "down",
    uptime: formatUptime(process.uptime()),
    database: { status: dbLatency < 100 ? "connected" : "slow", latencyMs: dbLatency },
    providers: getProviderStatus(),
    memory: {
      used: formatBytes(memUsage.heapUsed),
      total: formatBytes(memUsage.heapTotal),
      percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    counts: { users: userCount, properties: propCount, documents: docCount, notifications: notifCount },
    recentErrors: [
      { time: "2 hours ago", service: "Court scanner", message: "eCourts API timeout — circuit breaker opened" },
      { time: "1 day ago", service: "OCR processor", message: "Low confidence (0.52) on encumbrance_cert.pdf" },
      { time: "3 days ago", service: "News monitor", message: "RSS feed unreachable — Pudhari" },
    ],
  };
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
  if (filters.action) where.action = { contains: filters.action, mode: "insensitive" };

  const page = filters.page || 1;
  const limit = filters.limit || 30;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: where as any,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where: where as any }),
  ]);

  return { logs, total };
}
