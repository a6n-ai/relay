import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { archiveMailboxLetter, generateRelayMessageId, interpolate } from "@relay/engine";
import { z } from "zod";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { operatorGuard } from "@/lib/campaigns/http";
import { operatorDefaultFrom } from "@/lib/email/from-address";
import { getEmailProvider, hydrateSmtpFromDb } from "@/lib/email/provider";
import { templateTestMailboxLetter } from "@/lib/mailbox/template-test";

const schema = z.object({
  subject: z.string().trim().min(1),
  html: z.string().min(1),
  text: z.string().min(1),
  to: z.string().email().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handler(async (req: Request) => {
  await operatorGuard();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const session = await getSession();
  const to = parsed.data.to ?? session?.user.email;
  if (!to) throw new ValidationError("No test recipient");
  const vars = parsed.data.vars ?? {};
  const subject = interpolate(parsed.data.subject, vars);
  const html = interpolate(parsed.data.html, vars);
  const text = interpolate(parsed.data.text, vars);
  await hydrateSmtpFromDb();
  const from = await operatorDefaultFrom();
  const rfcMessageId = generateRelayMessageId();
  const sent = await getEmailProvider().send({
    to: { email: to },
    subject,
    html,
    text,
    from: from ?? undefined,
    rfcMessageId,
  });
  await archiveMailboxLetter(
    db,
    notificationTables,
    templateTestMailboxLetter({
      fromEmail: from?.email ?? "",
      fromName: from?.name ?? null,
      toEmail: to,
      subject,
      html,
      text,
      providerMessageId: sent.providerMessageId,
    }),
  );
  return json({ ok: true });
});
