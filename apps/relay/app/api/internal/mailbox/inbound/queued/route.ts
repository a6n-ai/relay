import { processQueuedInbound, queuedInboundSchema } from "@/lib/mailbox/process-queued";
import { signedInternalRoute } from "@/lib/mailbox/signed-internal-route";

export const runtime = "nodejs";

export const POST = signedInternalRoute(queuedInboundSchema, async (msg) => Response.json(await processQueuedInbound(msg)));
