export function getProviderStatus(): Record<string, { provider: string; type: string }> {
  const env = (k: string) => process.env[k] || "mock";
  const t = (v: string) => v === "mock" ? "mock" : "production";
  return {
    ocr: { provider: env("PROVIDER_OCR"), type: t(env("PROVIDER_OCR")) },
    govRecords: { provider: env("PROVIDER_GOV_RECORDS"), type: t(env("PROVIDER_GOV_RECORDS")) },
    courtRecords: { provider: env("PROVIDER_COURT_RECORDS"), type: t(env("PROVIDER_COURT_RECORDS")) },
    news: { provider: env("PROVIDER_NEWS"), type: t(env("PROVIDER_NEWS")) },
    notification: { provider: env("PROVIDER_NOTIFICATION"), type: t(env("PROVIDER_NOTIFICATION")) },
    riskEngine: { provider: env("PROVIDER_RISK_ENGINE"), type: t(env("PROVIDER_RISK_ENGINE")) },
    storage: { provider: env("PROVIDER_STORAGE"), type: t(env("PROVIDER_STORAGE")) },
    aiAgent: { provider: env("PROVIDER_AI_AGENT"), type: t(env("PROVIDER_AI_AGENT")) },
  };
}
