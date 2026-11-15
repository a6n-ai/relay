import { z } from "zod";
import { queuedInboundSchema, recordInboundFailure } from "@/lib/mailbox/process-queued";
import { signedInternalRoute } from "@/lib/mailbox/signed-internal-route";

export const runtime = "nodejs";

const failedSchema = z.object({
  message: queuedInboundSchema,
  attempts: z.number().int().min(1),
  error: z.string().nullish(),
});

export const POST = signedInternalRoute(failedSchema, async ({ message, attempts, error }) => {
  await recordInboundFailure(message, { attempts, error: error ?? null });
  return Response.json({ ok: true });
});
