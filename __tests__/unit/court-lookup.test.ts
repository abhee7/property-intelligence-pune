import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCase, searchCases, toSummary, EcourtsError, isEcourtsConfigured } from "@/modules/court/ecourts.client";

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
  process.env.ECOURTS_API_KEY = "eci_live_test";
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ECOURTS_API_KEY;
});

describe("eCourtsIndia client", () => {
  it("knows whether a key is set", () => {
    expect(isEcourtsConfigured()).toBe(true);
    delete process.env.ECOURTS_API_KEY;
    expect(isEcourtsConfigured()).toBe(false);
  });

  it("sends the key as a Bearer token and repeats array params", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({ data: { results: [] } }));
    await searchCases({ litigant: "A B", pageSize: 5 });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/partner/v2/search");
    expect(url.searchParams.getAll("litigants")).toEqual(["A B"]);
    expect(url.searchParams.get("nameMatchMode")).toBe("all");
    expect(url.searchParams.get("pageSize")).toBe("5");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer eci_live_test");
  });

  it("maps a search row to a case summary", () => {
    const s = toSummary({ cnr: "MHRT030007172016", registrationNumber: "162/2016", caseType: "CRL_MA", caseStatus: "DISPOSED", courtName: "Court", petitioners: ["P"], respondents: ["R", ""] });
    expect(s).toMatchObject({ cnr: "MHRT030007172016", caseNumber: "162/2016", caseStatus: "DISPOSED", petitioners: ["P"], respondents: ["R"] });
  });

  it("asks for something to search for", async () => {
    await expect(searchCases({})).rejects.toBeInstanceOf(EcourtsError);
  });

  it("explains a rejected key, a missing case and a rate limit", async () => {
    for (const [status, code] of [[401, "auth"], [404, "not_found"], [429, "rate_limited"], [500, "api"]] as const) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: false, status } as Response);
      await expect(searchCases({ query: "x" })).rejects.toMatchObject({ code });
    }
  });

  it("says so when no key is set, without calling out", async () => {
    delete process.env.ECOURTS_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(searchCases({ query: "x" })).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a case in full: hearings and both kinds of order", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okJson({
        data: {
          courtCaseData: {
            cnr: "MHRT030007172016", caseNumber: "709/2016", registrationNumber: "162/2016", caseStatus: "PENDING", courtName: "Court",
            petitioners: ["P"], respondents: ["R"], petitionerAdvocates: ["Adv"],
            historyOfCaseHearings: [{ hearingDate: "2016-05-27", purposeOfListing: "Hearing", judge: "J" }, { purposeOfListing: "no date" }],
            interimOrders: [{ orderDate: "2016-06-01", orderType: "Interim stay order", orderUrl: "u1" }],
            judgmentOrders: [{ orderDate: "2017-01-20", orderType: "Final order" }],
          },
        },
      }),
    );
    const c = await getCase("MHRT030007172016");
    expect(c.caseNumber).toBe("162/2016");
    expect(c.hearings).toHaveLength(1);
    expect(c.orders.map((o) => [o.type, o.interim])).toEqual([["Interim stay order", true], ["Final order", false]]);
  });

  it("rejects a malformed CNR before calling out", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(getCase("../etc/passwd")).rejects.toBeInstanceOf(EcourtsError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
