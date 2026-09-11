import { createLogger } from "@foundry/commons/logger";
import { processWhatsAppWebhookEvents } from "@/lib/whatsapp/process-webhook";
import { handleWhatsAppWebhookGet, handleWhatsAppWebhookPost } from "@/lib/whatsapp/webhook-http";

export const runtime = "nodejs";

const log = createLogger("whatsapp-webhook-route");

function appSecret(): string | undefined {
  return process.env.WHATSAPP_APP_SECRET ?? process.env.META_WHATSAPP_APP_SECRET;
}

function verifyToken(): string | undefined {
  return process.env.WHATSAPP_VERIFY_TOKEN ?? process.env.META_WHATSAPP_VERIFY_TOKEN;
}

/** Meta webhook verification challenge. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const result = await handleWhatsAppWebhookGet({
    searchParams: url.searchParams,
    verifyToken: verifyToken(),
  });
  switch (result.kind) {
    case "challenge":
      return new Response(result.challenge, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    case "error":
      return Response.json({ title: result.title, status: result.status }, { status: result.status });
    case "ok":
      return Response.json({ title: "Unexpected GET result", status: 500 }, { status: 500 });
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

/** Meta Cloud API messages / statuses / account_update. */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const result = await handleWhatsAppWebhookPost({
    raw,
    signature,
    appSecret: appSecret(),
    onEvents: processWhatsAppWebhookEvents,
  });
  switch (result.kind) {
    case "ok":
      log.debug({ eventCount: result.eventCount }, "whatsapp webhook processed");
      return new Response(null, { status: 200 });
    case "error":
      return Response.json({ title: result.title, status: result.status }, { status: result.status });
    case "challenge":
      return Response.json({ title: "Unexpected POST result", status: 500 }, { status: 500 });
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
