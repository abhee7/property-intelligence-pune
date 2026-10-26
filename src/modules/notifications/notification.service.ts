// src/modules/notifications/notification.service.ts
//
// Multi-channel notification dispatch
// Prototype: in-app notifications are real (stored in DB)
//            WhatsApp/email/SMS are simulated (logged to console)
// Production: swap mock channels for Twilio/SES via provider registry

import { prisma } from "@/lib/db/client";
import { renderTemplate, TEMPLATES } from "@/lib/validation/notification.schema";
import type { NotificationChannel, NotificationPriority, NotificationSearchInput } from "@/lib/validation/notification.schema";

// ─── Types ───

export interface NotificationRecord {
  id: string;
  tenantId: string;
  userId: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  priority: string;
  readAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface DispatchResult {
  success: boolean;
  messageId: string;
  channel: NotificationChannel;
  simulatedDelivery: boolean;
  error?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byChannel: Record<string, number>;
  byPriority: Record<string, number>;
  recentCount: number; // Last 24h
}

// ─── Channel simulation ───
// These print to console for the prototype
// Production: replace with Twilio/SES/Firebase calls

function simulateWhatsApp(to: string, body: string): DispatchResult {
  const messageId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  📱 WHATSAPP MESSAGE SENT                        ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  To:     ${to.padEnd(40)}║`);
  console.log(`║  ID:     ${messageId.padEnd(40)}║`);
  console.log(`╠──────────────────────────────────────────────────╣`);
  body.split("\n").forEach(line => {
    console.log(`║  ${line.padEnd(48)}║`);
  });
  console.log(`╚══════════════════════════════════════════════════╝\n`);
  return { success: true, messageId, channel: "whatsapp", simulatedDelivery: true };
}

function simulateEmail(to: string, subject: string, body: string): DispatchResult {
  const messageId = `em_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`\n┌──────────────────────────────────────────────────┐`);
  console.log(`│  📧 EMAIL SENT                                    │`);
  console.log(`├──────────────────────────────────────────────────┤`);
  console.log(`│  To:      ${to.padEnd(39)}│`);
  console.log(`│  Subject: ${subject.slice(0, 39).padEnd(39)}│`);
  console.log(`│  ID:      ${messageId.padEnd(39)}│`);
  console.log(`└──────────────────────────────────────────────────┘\n`);
  return { success: true, messageId, channel: "email", simulatedDelivery: true };
}

function simulateSms(to: string, body: string): DispatchResult {
  const messageId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`\n[SMS → ${to}] ${body.slice(0, 160)}\n`);
  return { success: true, messageId, channel: "sms", simulatedDelivery: true };
}

// ─── Core dispatch ───

export async function sendNotification(
  tenantId: string,
  userId: string,
  channel: NotificationChannel,
  subject: string | null,
  body: string,
  priority: NotificationPriority = "normal",
  metadata?: Record<string, unknown>,
): Promise<{ notification: NotificationRecord; delivery: DispatchResult }> {
  // Store in database (all channels get an in-app record too)
  const notification = await prisma.notification.create({
    data: {
      tenantId,
      userId,
      channel,
      subject,
      body,
      status: "SENDING",
      priority: priority.toUpperCase(),
      dataPayload: metadata || {},
      createdAt: new Date(),
    },
  });

  // Dispatch via channel
  let delivery: DispatchResult;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true, firstName: true, lastName: true },
  });

  switch (channel) {
    case "whatsapp":
      delivery = simulateWhatsApp(user?.phone || "+91-XXXXXXXXXX", body);
      break;
    case "email":
      delivery = simulateEmail(user?.email || "user@example.com", subject || "PropIntel Notification", body);
      break;
    case "sms":
      delivery = simulateSms(user?.phone || "+91-XXXXXXXXXX", body);
      break;
    case "in_app":
    default:
      delivery = { success: true, messageId: notification.id, channel: "in_app", simulatedDelivery: false };
      break;
  }

  // Update status
  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: delivery.success ? "SENT" : "FAILED",
      externalMsgId: delivery.messageId,
      sentAt: delivery.success ? new Date() : null,
      errorMessage: delivery.error || null,
    },
  });

  return {
    notification: {
      ...notification,
      status: delivery.success ? "SENT" : "FAILED",
      sentAt: delivery.success ? new Date() : null,
      metadata: metadata || {},
    } as unknown as NotificationRecord,
    delivery,
  };
}

// ─── Template-based dispatch ───

export async function sendTemplatedNotification(
  tenantId: string,
  userId: string,
  eventType: string,
  channel: NotificationChannel,
  variables: Record<string, string>,
  priority: NotificationPriority = "normal",
): Promise<{ notification: NotificationRecord; delivery: DispatchResult } | null> {
  const template = TEMPLATES.find(t => t.event === eventType && t.channel === channel);
  if (!template) return null;

  const { subject, body } = renderTemplate(template, variables);
  return sendNotification(tenantId, userId, channel, subject, body, priority, { templateId: template.id, eventType, variables });
}

// ─── Multi-channel broadcast ───

export async function broadcastNotification(
  tenantId: string,
  userId: string,
  eventType: string,
  variables: Record<string, string>,
  priority: NotificationPriority = "normal",
): Promise<DispatchResult[]> {
  // Check user preferences
  const pref = await prisma.notificationPreference.findFirst({
    where: { userId, eventType },
  });

  const results: DispatchResult[] = [];

  // Always send in-app
  const inApp = await sendNotification(tenantId, userId, "in_app", null, renderTemplate(
    TEMPLATES.find(t => t.event === eventType && t.channel === "whatsapp") || TEMPLATES[0],
    variables,
  ).body, priority, { eventType, variables });
  results.push(inApp.delivery);

  // Send to enabled channels
  if (!pref || pref.whatsappEnabled) {
    const wa = await sendTemplatedNotification(tenantId, userId, eventType, "whatsapp", variables, priority);
    if (wa) results.push(wa.delivery);
  }
  if (!pref || pref.emailEnabled) {
    const em = await sendTemplatedNotification(tenantId, userId, eventType, "email", variables, priority);
    if (em) results.push(em.delivery);
  }

  return results;
}

// ─── Query notifications ───

export async function getUserNotifications(
  userId: string,
  input: NotificationSearchInput,
): Promise<{ notifications: NotificationRecord[]; total: number; unread: number }> {
  const where: Record<string, unknown> = { userId };

  if (input.status === "unread") where.readAt = null;
  if (input.status === "read") where.readAt = { not: null };
  if (input.channel !== "all") where.channel = input.channel.toUpperCase();

  const skip = (input.page - 1) * input.limit;

  const [notifications, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.limit,
    }),
    prisma.notification.count({ where: where as any }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    notifications: notifications as unknown as NotificationRecord[],
    total,
    unread,
  };
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date(), status: "READ" },
  });
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date(), status: "READ" },
  });
  return result.count;
}

export async function getNotificationStats(userId: string): Promise<NotificationStats> {
  const all = await prisma.notification.findMany({
    where: { userId },
    select: { channel: true, priority: true, readAt: true, createdAt: true },
  });

  const now = Date.now();
  const dayAgo = now - 86400000;
  const byChannel: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let unread = 0;
  let recentCount = 0;

  for (const n of all) {
    byChannel[n.channel] = (byChannel[n.channel] || 0) + 1;
    byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
    if (!n.readAt) unread++;
    if (n.createdAt.getTime() > dayAgo) recentCount++;
  }

  return { total: all.length, unread, byChannel, byPriority, recentCount };
}
