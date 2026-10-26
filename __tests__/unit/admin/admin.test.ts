// __tests__/unit/admin/admin.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { getAuditLogs, listUsers, updateUserRole, updateUserStatus } from "@/modules/admin/admin.service";

const db = prisma as any;

beforeEach(() => vi.clearAllMocks());

describe("updateUserStatus / updateUserRole", () => {
  it("only touches users in the caller's own tenant", async () => {
    db.user.updateMany.mockResolvedValue({ count: 1 });
    await updateUserStatus("tenant-a", "user-1", false);
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: "user-1", tenantId: "tenant-a" }, data: { isActive: false } });
  });

  it("reports 'not found' for a user that belongs to another tenant", async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateUserStatus("tenant-a", "user-of-b", true)).rejects.toThrow("User not found");
  });

  it("changes a role within the tenant, and rejects an unknown role", async () => {
    db.role.findUnique.mockResolvedValueOnce({ id: "role-broker" });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    await updateUserRole("tenant-a", "user-1", "broker");
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: "user-1", tenantId: "tenant-a" }, data: { roleId: "role-broker" } });

    db.role.findUnique.mockResolvedValueOnce(null);
    await expect(updateUserRole("tenant-a", "user-1", "emperor")).rejects.toThrow("Invalid role");
  });
});

describe("listUsers", () => {
  it("searches name and email without the case-insensitive option SQLite doesn't support", async () => {
    db.user.findMany.mockResolvedValue([]);
    db.user.count.mockResolvedValue(0);
    await listUsers("tenant-a", { q: "kul" });
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("tenant-a");
    expect(JSON.stringify(where.OR)).not.toContain("insensitive");
    expect(where.OR).toHaveLength(3);
  });
});

describe("getAuditLogs", () => {
  it("attaches the people behind each entry", async () => {
    db.auditLog.findMany.mockResolvedValue([
      { id: "a1", userId: "u1", action: "auth.login" },
      { id: "a2", userId: null, action: "system.job" },
    ]);
    db.auditLog.count.mockResolvedValue(2);
    db.user.findMany.mockResolvedValue([{ id: "u1", firstName: "Prashant", lastName: "Kulkarni", email: "p@x.in" }]);

    const { logs, total } = await getAuditLogs("tenant-a");
    expect(total).toBe(2);
    expect(logs[0].user).toMatchObject({ firstName: "Prashant" });
    expect(logs[1].user).toBeNull();
    expect(db.auditLog.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-a" });
  });
});

describe("recordAudit", () => {
  it("writes the entry with the request's IP and user agent", async () => {
    db.auditLog.create.mockResolvedValue({});
    const req = new Request("http://localhost/api/x", { headers: { "x-forwarded-for": "10.0.0.7, 10.0.0.1", "user-agent": "vitest" } });
    await recordAudit({ tenantId: "t1", userId: "u1", action: "document.upload", resourceType: "document", resourceId: "d1", metadata: { file: "a.png" } }, req as any);

    const data = db.auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: "t1", userId: "u1", action: "document.upload", resourceType: "document", resourceId: "d1", ipAddress: "10.0.0.7", userAgent: "vitest" });
    expect(JSON.parse(data.metadata)).toEqual({ file: "a.png" });
  });

  it("never throws, so a logging failure can't break the action it describes", async () => {
    db.auditLog.create.mockRejectedValue(new Error("database is locked"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordAudit({ tenantId: "t1", action: "auth.login", resourceType: "user" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
