import { and, eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import {
  type OtpType,
  type SecurityEmailContext,
  sendNewLogin,
  sendOtpEmail,
  sendPasswordChanged,
} from "@foundry/auth";
import type { EmailProvider } from "@foundry/email";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/provider";

const log = createLogger("auth-security");
const APP_NAME = "Relay";

function ctx(): SecurityEmailContext {
  return { provider: getEmailProvider() as EmailProvider, appName: APP_NAME, log };
}

export function sendAuthOtp(email: string, otp: string, type: OtpType): Promise<void> {
  return sendOtpEmail(ctx(), email, otp, type);
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
