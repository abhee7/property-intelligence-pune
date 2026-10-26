// src/lib/validation/notification.schema.ts

import { z } from "zod";

export const notificationChannels = ["whatsapp", "email", "sms", "in_app"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const notificationPriorities = ["low", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof notificationPriorities)[number];

export const sendNotificationSchema = z.object({
  recipientId: z.string().min(1, "Recipient is required"),
  channel: z.enum(notificationChannels),
  subject: z.string().max(300).optional(),
  body: z.string().min(1, "Message body is required").max(4000),
  priority: z.enum(notificationPriorities).default("normal"),
  templateId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updatePreferencesSchema = z.object({
  preferences: z.array(z.object({
    eventType: z.string().min(1),
    emailEnabled: z.boolean(),
    whatsappEnabled: z.boolean(),
    smsEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
  })),
});

export const notificationSearchSchema = z.object({
  status: z.enum(["all", "unread", "read"]).default("all"),
  channel: z.enum([...notificationChannels, "all"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// ─── Notification event types ───

export const EVENT_TYPES = [
  { key: "risk_alert", label: "Risk alerts", description: "When a property risk score changes significantly" },
  { key: "verification_complete", label: "Verification complete", description: "When property verification finishes" },
  { key: "document_processed", label: "Document processed", description: "When OCR completes on an uploaded document" },
  { key: "match_found", label: "Match detected", description: "When a potential duplicate or conflict is found" },
  { key: "court_case_update", label: "Court case updates", description: "New hearings, orders, or status changes" },
  { key: "newspaper_mention", label: "Newspaper mentions", description: "When a property is mentioned in news" },
  { key: "property_status", label: "Property status changes", description: "When a property status is updated" },
  { key: "system_alert", label: "System alerts", description: "Platform announcements and maintenance" },
] as const;

// ─── Message templates ───

export interface NotificationTemplate {
  id: string;
  event: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  variables: string[];
}

export const TEMPLATES: NotificationTemplate[] = [
  {
    id: "tpl-risk-alert-wa", event: "risk_alert", channel: "whatsapp",
    subject: "",
    body: `🚨 *RISK ALERT*\n\n*Property:* {{propertyTitle}}\n*Risk Score:* {{riskScore}}/100 — {{riskLevel}}\n\n{{riskSummary}}\n\n*Action required:* Review the risk report in your PropIntel dashboard.\n\n_Sent via PropIntel Intelligence Platform_`,
    variables: ["propertyTitle", "riskScore", "riskLevel", "riskSummary"],
  },
  {
    id: "tpl-risk-alert-email", event: "risk_alert", channel: "email",
    subject: "⚠️ Risk Alert: {{propertyTitle}} — {{riskLevel}}",
    body: `A risk assessment has been completed for your property.\n\nProperty: {{propertyTitle}}\nRisk Score: {{riskScore}}/100\nRisk Level: {{riskLevel}}\n\n{{riskSummary}}\n\nPlease log in to your PropIntel dashboard to review the full report and take appropriate action.\n\nBest regards,\nPropIntel Intelligence Platform`,
    variables: ["propertyTitle", "riskScore", "riskLevel", "riskSummary"],
  },
  {
    id: "tpl-verification-wa", event: "verification_complete", channel: "whatsapp",
    subject: "",
    body: `✅ *VERIFICATION COMPLETE*\n\n*Property:* {{propertyTitle}}\n*Status:* {{verificationStatus}}\n*Checks passed:* {{checksPassed}}/{{checksTotal}}\n\nView the full report:\n{{reportUrl}}\n\n_Sent via PropIntel_`,
    variables: ["propertyTitle", "verificationStatus", "checksPassed", "checksTotal", "reportUrl"],
  },
  {
    id: "tpl-match-wa", event: "match_found", channel: "whatsapp",
    subject: "",
    body: `🔔 *MATCH DETECTED*\n\n*Type:* {{matchType}}\n*Score:* {{matchScore}}%\n\n*Property A:* {{propertyATitle}}\n*Property B:* {{propertyBTitle}}\n\nReview and resolve in your dashboard.\n\n_Sent via PropIntel_`,
    variables: ["matchType", "matchScore", "propertyATitle", "propertyBTitle"],
  },
  {
    id: "tpl-match-email", event: "match_found", channel: "email",
    subject: "🔔 Match Detected: {{matchType}} ({{matchScore}}% confidence)",
    body: `A potential match has been detected between two properties in your portfolio.\n\nMatch Type: {{matchType}}\nConfidence: {{matchScore}}%\n\nProperty A: {{propertyATitle}}\nProperty B: {{propertyBTitle}}\n\nPlease review this match in your PropIntel dashboard and take appropriate action.\n\nBest regards,\nPropIntel`,
    variables: ["matchType", "matchScore", "propertyATitle", "propertyBTitle"],
  },
  {
    id: "tpl-court-wa", event: "court_case_update", channel: "whatsapp",
    subject: "",
    body: `⚖️ *COURT CASE UPDATE*\n\n*Case:* {{caseNumber}}\n*Court:* {{courtName}}\n*Update:* {{updateType}}\n\n{{updateSummary}}\n\n_Sent via PropIntel_`,
    variables: ["caseNumber", "courtName", "updateType", "updateSummary"],
  },
  {
    id: "tpl-news-wa", event: "newspaper_mention", channel: "whatsapp",
    subject: "",
    body: `📰 *NEWS MENTION*\n\n*Property:* {{propertyTitle}}\n*Headline:* {{articleHeadline}}\n*Source:* {{articleSource}}\n*Sentiment:* {{sentiment}}\n\n_Sent via PropIntel_`,
    variables: ["propertyTitle", "articleHeadline", "articleSource", "sentiment"],
  },
];

export function renderTemplate(template: NotificationTemplate, variables: Record<string, string>): { subject: string; body: string } {
  let subject = template.subject;
  let body = template.body;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    subject = subject.replaceAll(placeholder, value);
    body = body.replaceAll(placeholder, value);
  }
  return { subject, body };
}

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type NotificationSearchInput = z.infer<typeof notificationSearchSchema>;
