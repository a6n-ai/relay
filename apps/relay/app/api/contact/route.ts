import { ingestInboundLetter } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { tenantForInbox } from "@/lib/mailbox/inbound-recipient";
import { allowContact, verifyTurnstile } from "@/lib/contact/guards";
import { CONTACT_MAX_BYTES, buildContactLetter, contactSchema } from "@/lib/contact/contact";

export const runtime = "nodejs";

const log = createLogger("contact-route");

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > CONTACT_MAX_BYTES) {
    return Response.json({ title: "Payload too large", status: 413 }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ title: "Invalid JSON", status: 400 }, { status: 400 });
  }
  // Bots fill the hidden `website` field; answer as if accepted so they do not retry.
  const website = typeof body === "object" && body !== null ? (body as { website?: unknown }).website : undefined;
  if (typeof website === "string" && website.length > 0) {
    return Response.json({ ok: true });
  }
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ title: "Invalid contact form", status: 400 }, { status: 400 });
  }
  const ip = req.headers.get("cf-connecting-ip");
  if (!(await verifyTurnstile(parsed.data.token, ip))) {
    return Response.json({ title: "Verification failed", status: 400 }, { status: 400 });
  }
  if (!(await allowContact(ip ?? "unknown"))) {
    return Response.json({ title: "Too many messages, try again shortly", status: 429 }, { status: 429 });
  }
  const inbox = process.env.CONTACT_INBOX;
  const recipientTenantId = inbox ? await tenantForInbox(inbox) : null;
  if (!inbox || recipientTenantId === null) {
    log.error({ inbox }, "contact inbox is not held by exactly one app");
    return Response.json({ title: "Contact is unavailable right now", status: 503 }, { status: 503 });
  }
  const letter = buildContactLetter(parsed.data, { inbox, now: Date.now(), id: crypto.randomUUID() });
  await ingestInboundLetter(db, notificationTables, letter, { recipientTenantId, authResults: null });
  return Response.json({ ok: true });
}
