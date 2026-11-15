import type { z } from "zod";
import { verifyWebhookSignature } from "@/lib/webhooks/sign";

const MAX_BODY_BYTES = 65_536;

// The route is public (HMAC is the only gate), so never buffer more than the largest legitimate body.
async function readCapped(req: Request): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** The Worker signs the raw JSON body with MAILBOX_INBOUND_SECRET, as the inbound route does. */
export function signedInternalRoute<T extends z.ZodType>(
  schema: T,
  handle: (body: z.output<T>) => Promise<Response>,
) {
  return async function POST(req: Request): Promise<Response> {
    const secret = process.env.MAILBOX_INBOUND_SECRET;
    if (!secret) return Response.json({ title: "Inbound mailbox is not configured" }, { status: 503 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return Response.json({ title: "Body too large" }, { status: 413 });
    }
    const raw = await readCapped(req);
    if (raw === null) return Response.json({ title: "Body too large" }, { status: 413 });
    const signature = req.headers.get("x-relay-signature");
    if (!signature || !verifyWebhookSignature(secret, raw, signature)) {
      return Response.json({ title: "Invalid signature" }, { status: 401 });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ title: "Invalid JSON" }, { status: 400 });
    }
    const body = schema.safeParse(json);
    if (!body.success) return Response.json({ title: "Invalid body" }, { status: 400 });
    return handle(body.data);
  };
}
