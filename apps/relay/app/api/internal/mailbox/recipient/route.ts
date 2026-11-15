import { z } from "zod";
import { tenantForInbox } from "@/lib/mailbox/inbound-recipient";
import { signedInternalRoute } from "@/lib/mailbox/signed-internal-route";

export const runtime = "nodejs";

export const POST = signedInternalRoute(z.object({ envelopeTo: z.string().min(1) }), async ({ envelopeTo }) => {
  const tenantId = await tenantForInbox(envelopeTo);
  return tenantId == null ? Response.json({ title: "No such mailbox" }, { status: 404 }) : Response.json({ ok: true });
});
