import { ingestInboundLetter } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { handleMailboxInboundPost } from "@/lib/mailbox/inbound-http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const result = await handleMailboxInboundPost({
    raw,
    signature: req.headers.get("x-relay-signature"),
    secret: process.env.MAILBOX_INBOUND_SECRET,
    ingest: (letter) => ingestInboundLetter(db, notificationTables, letter),
  });
  return Response.json(result.body ?? { ok: true }, { status: result.status });
}
