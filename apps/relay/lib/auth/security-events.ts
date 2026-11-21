import { and, eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import {
  type OtpType,
  type SecurityEmailContext,
  sendNewLogin,
  sendOtpEmail,
  sendPasswordChanged,
} from "@foundry/auth";
import type { EmailProvider } from "@foundry/commons";
import { renderEmailTemplate } from "@relay/email";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/provider";

const log = createLogger("auth-security");
const APP_NAME = "Relay";

function ctx(): SecurityEmailContext {
  return {
    provider: getEmailProvider() as EmailProvider,
    renderEmail: renderEmailTemplate,
    appName: APP_NAME,
    log,
  };
}

export function sendAuthOtp(email: string, otp: string, type: OtpType): Promise<void> {
  return sendOtpEmail(ctx(), email, otp, type);
}

// The body is markdown rendered to HTML, so user-supplied names must be escaped before they reach it.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// < and > stay out of this set: a backslash before escapeHtml's &#60; would print literally.
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&");
}

const plain = (text: string) => escapeHtml(escapeMarkdown(text));

export async function sendInviteEmail(params: {
  email: string;
  workspaceName: string;
  inviterName: string;
  url: string;
}): Promise<void> {
  const { provider, renderEmail } = ctx();
  const rendered = await renderEmail({
    subject: `You’re invited to ${params.workspaceName} on Relay`,
    body: `${plain(params.inviterName)} invited you to join ${plain(params.workspaceName)}. Open this link to accept: ${escapeHtml(params.url)}. The invite lasts 7 days.`,
    vars: {},
    appName: APP_NAME,
  });
  await provider.send({
    to: { email: params.email },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export function notifyPasswordChanged(email: string | null | undefined): Promise<void> {
  return email ? sendPasswordChanged(ctx(), email) : Promise.resolve();
}

export async function notifyNewLoginIfNewDevice(params: {
  userId: string;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const { email, ip } = params;
  if (!email || !ip) return;

  const priorSameIp = await db
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, BigInt(params.userId)), eq(sessionTable.ipAddress, ip)))
    .limit(2);
  if (priorSameIp.length > 1) return;

  await sendNewLogin(ctx(), email, {
    ip,
    userAgent: params.userAgent,
    when: new Date().toISOString(),
  });
}
