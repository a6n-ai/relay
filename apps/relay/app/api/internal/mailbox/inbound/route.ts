import { MailboxInboundError, ingestInboundLetter } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { handleMailboxInboundPost } from "@/lib/mailbox/inbound-http";
import { tenantForInbox } from "@/lib/mailbox/inbound-recipient";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const to = req.headers.get("x-relay-envelope-to");
  const from = req.headers.get("x-relay-envelope-from");
  const envelope = to && from != null ? { to, from } : null;
  const result = await handleMailboxInboundPost({
    raw,
    envelope,
    signature: req.headers.get("x-relay-signature"),
    secret: process.env.MAILBOX_INBOUND_SECRET,
    ingest: async (letter) => {
      const recipientTenantId = await tenantForInbox(letter.toEmail);
      // Routed mail must land in a real Relay inbox; other providers keep the thread-based match.
      if (envelope && recipientTenantId == null) throw new MailboxInboundError("unknown_mailbox", "No such mailbox");
      return ingestInboundLetter(db, notificationTables, letter, envelope ? { recipientTenantId } : undefined);
    },
  });
  return Response.json(result.body ?? { ok: true }, { status: result.status });
}
