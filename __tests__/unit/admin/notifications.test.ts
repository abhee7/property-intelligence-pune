// __tests__/unit/admin/notifications.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { isRiskEscalation, notifyRiskEscalation } from "@/modules/notifications/notification.service";

const db = prisma as any;

beforeEach(() => vi.clearAllMocks());

describe("isRiskEscalation", () => {
  it.each([
    ["MODERATE", "HIGH", true],
    ["LOW", "CRITICAL", true],
    ["HIGH", "CRITICAL", true],
    ["MINIMAL", "MODERATE", false], // rising, but not into High
    ["HIGH", "HIGH", false], // unchanged
    ["CRITICAL", "HIGH", false], // falling
    ["HIGH", "MODERATE", false],
  ])("%s → %s: %s", (from, to, expected) => {
    expect(isRiskEscalation(from, to)).toBe(expected);
  });

  it("a property's very first score is not news (e.g. a bulk import)", () => {
    expect(isRiskEscalation(null, "CRITICAL")).toBe(false);
    expect(isRiskEscalation(undefined, "HIGH")).toBe(false);
  });
});

describe("notifyRiskEscalation", () => {
  const setup = (property: unknown, admins: { id: string }[]) => {
    db.property.findFirst.mockResolvedValue(property);
    db.user.findMany.mockResolvedValue(admins);
    db.notification.create.mockImplementation(async ({ data }: any) => ({ id: `n-${data.userId}`, ...data }));
    db.user.findUnique.mockResolvedValue({ email: "x@y.in", phone: null, firstName: "A", lastName: "B" });
    db.notification.update.mockResolvedValue({});
  };

  it("alerts the owner, the broker and each agency admin once, in-app only", async () => {
    setup({ title: "2 BHK in Baner", ownerId: "owner-1", brokerId: "broker-1" }, [{ id: "admin-1" }, { id: "broker-1" }]);
    const count = await notifyRiskEscalation("t1", "p1", "MODERATE", "HIGH", 62);

    expect(count).toBe(3); // owner, broker, admin — the broker who is also listed isn't alerted twice
    const created = db.notification.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created.map((d: any) => d.userId).sort()).toEqual(["admin-1", "broker-1", "owner-1"]);
    for (const d of created) {
      expect(d.channel).toBe("in_app");
      expect(d.tenantId).toBe("t1");
      expect(d.subject).toBe("Risk raised to High");
      expect(d.body).toBe("2 BHK in Baner moved from Moderate to High (62/100).");
      expect(d.priority).toBe("HIGH");
      expect(JSON.parse(d.dataPayload)).toMatchObject({ eventType: "risk_alert", propertyId: "p1", previous: "MODERATE", current: "HIGH", score: 62 });
    }
  });

  it("marks a jump to Critical as urgent", async () => {
    setup({ title: "Villa", ownerId: null, brokerId: null }, [{ id: "admin-1" }]);
    await notifyRiskEscalation("t1", "p1", "HIGH", "CRITICAL", 81);
    expect(db.notification.create.mock.calls[0][0].data.priority).toBe("URGENT");
  });

  it("does nothing for a property that isn't in the tenant", async () => {
    setup(null, []);
    expect(await notifyRiskEscalation("t1", "gone", "LOW", "HIGH", 60)).toBe(0);
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
