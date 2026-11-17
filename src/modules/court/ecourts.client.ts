// src/modules/court/ecourts.client.ts
//
// Thin client for the eCourtsIndia partner API (https://webapi.ecourtsindia.com).
// Auth is a Bearer key (ECOURTS_API_KEY). Calls are billed per use (about ₹0.60 for a search that
// returns results, ₹1.50 for a case detail), so the app only calls it when a person asks for it.

export interface LiveCaseSummary {
  cnr: string;
  caseNumber: string;
  caseType: string | null;
  caseStatus: string;
  courtName: string | null;
  filingDate: string | null;
  nextHearingDate: string | null;
  decisionDate: string | null;
  petitioners: string[];
  respondents: string[];
}

export interface LiveCaseDetail extends LiveCaseSummary {
  petitionerAdvocates: string[];
  respondentAdvocates: string[];
  judges: string[];
  hearings: { date: string; purpose: string | null; judge: string | null }[];
  orders: { date: string | null; type: string; url: string | null; interim: boolean }[];
}

export class EcourtsError extends Error {
  constructor(message: string, readonly code: "not_configured" | "auth" | "not_found" | "rate_limited" | "api" | "network") {
    super(message);
  }
}

const BASE = () => (process.env.ECOURTS_API_BASE || "https://webapi.ecourtsindia.com").replace(/\/+$/, "");
const TIMEOUT_MS = 30_000;

export function isEcourtsConfigured(): boolean {
  return !!process.env.ECOURTS_API_KEY?.trim();
}

async function call(path: string, params?: Record<string, string | number | string[] | undefined>): Promise<any> {
  const key = process.env.ECOURTS_API_KEY?.trim();
  if (!key) throw new EcourtsError("The eCourts key (ECOURTS_API_KEY) is not set.", "not_configured");

  const url = new URL(BASE() + path);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === "") continue;
    for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item)); // arrays repeat the key
  }

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e: any) {
    throw new EcourtsError(`Couldn't reach eCourtsIndia: ${e?.message || e}`, "network");
  }
  if (res.status === 401 || res.status === 403) throw new EcourtsError("eCourtsIndia rejected the API key.", "auth");
  if (res.status === 404) throw new EcourtsError("eCourtsIndia has no record for that request.", "not_found");
  if (res.status === 429) throw new EcourtsError("eCourtsIndia is rate limiting this key — try again shortly.", "rate_limited");
  if (!res.ok) throw new EcourtsError(`eCourtsIndia answered HTTP ${res.status}.`, "api");
  return res.json();
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function toSummary(r: any): LiveCaseSummary {
  return {
    cnr: String(r.cnr ?? r.id ?? ""),
    caseNumber: str(r.registrationNumber) ?? str(r.caseNumber) ?? str(r.filingNumber) ?? String(r.cnr ?? ""),
    caseType: str(r.caseType),
    caseStatus: str(r.caseStatus) ?? "UNKNOWN",
    courtName: str(r.courtName),
    filingDate: str(r.filingDate),
    nextHearingDate: str(r.nextHearingDate),
    decisionDate: str(r.decisionDate),
    petitioners: strings(r.petitioners),
    respondents: strings(r.respondents),
  };
}

export interface SearchOptions {
  /** free text, matched against the whole case record */
  query?: string;
  /** a person who is either petitioner or respondent */
  litigant?: string;
  pageSize?: number;
}

/** Searches live court records. Results are candidates only — nothing is linked to a property here. */
export async function searchCases(opts: SearchOptions): Promise<LiveCaseSummary[]> {
  if (!opts.query && !opts.litigant) throw new EcourtsError("Give a name or some text to search for.", "api");
  const json = await call("/api/partner/v2/search", {
    query: opts.query,
    litigants: opts.litigant ? [opts.litigant] : undefined,
    nameMatchMode: opts.litigant ? "all" : undefined,
    pageSize: Math.min(opts.pageSize ?? 10, 50),
  });
  const rows: any[] = json?.data?.results ?? [];
  return rows.map(toSummary).filter((c) => c.cnr);
}

export async function getCase(cnr: string): Promise<LiveCaseDetail> {
  if (!/^[A-Za-z0-9]{16}$/.test(cnr)) throw new EcourtsError("A CNR number has 16 letters and digits.", "api");
  const json = await call(`/api/partner/case/${cnr}`);
  const c = json?.data?.courtCaseData;
  if (!c) throw new EcourtsError("eCourtsIndia returned no case data.", "not_found");
  const order = (o: any, interim: boolean) => ({ date: str(o?.orderDate), type: str(o?.orderType) ?? (interim ? "Interim order" : "Judgment"), url: str(o?.orderUrl), interim });
  return {
    ...toSummary({ ...c, cnr: c.cnr ?? cnr }),
    petitionerAdvocates: strings(c.petitionerAdvocates),
    respondentAdvocates: strings(c.respondentAdvocates),
    judges: strings(c.judges),
    hearings: (Array.isArray(c.historyOfCaseHearings) ? c.historyOfCaseHearings : [])
      .filter((h: any) => str(h?.hearingDate))
      .map((h: any) => ({ date: String(h.hearingDate), purpose: str(h.purposeOfListing), judge: str(h.judge) })),
    orders: [
      ...(Array.isArray(c.interimOrders) ? c.interimOrders : []).map((o: any) => order(o, true)),
      ...(Array.isArray(c.judgmentOrders) ? c.judgmentOrders : []).map((o: any) => order(o, false)),
    ],
  };
}
