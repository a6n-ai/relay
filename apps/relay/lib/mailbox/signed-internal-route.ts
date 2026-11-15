import type { z } from "zod";
import { verifyWebhookSignature } from "@/lib/webhooks/sign";

/** The Worker signs the raw JSON body with MAILBOX_INBOUND_SECRET, as the inbound route does. */
export function signedInternalRoute<T extends z.ZodType>(
  schema: T,
  handle: (body: z.output<T>) => Promise<Response>,
) {
  return async function POST(req: Request): Promise<Response> {
    const secret = process.env.MAILBOX_INBOUND_SECRET;
    if (!secret) return Response.json({ title: "Inbound mailbox is not configured" }, { status: 503 });
    const raw = await req.text();
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
