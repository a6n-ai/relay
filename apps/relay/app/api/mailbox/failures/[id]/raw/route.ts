import { NotFoundError } from "@foundry/commons";
import { handler } from "@foundry/routes";
import { operatorGuard } from "@/lib/campaigns/http";
import { downloadResponse } from "@/lib/mailbox/attachments";
import { readInboundFailure } from "@/lib/mailbox/failures";
import { mailBucket } from "@/lib/mailbox/mail-bucket";
import { mailboxScope } from "@/lib/mailbox/scope";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await operatorGuard();
  const { id } = await ctx.params;
  const row = await readInboundFailure(await mailboxScope(), id);
  if (!row) throw new NotFoundError("Not found");
  const obj = await mailBucket().get(row.rawKey);
  if (!obj) throw new NotFoundError("Not found");
  return downloadResponse(obj, { filename: `email-${row.receivedAt}.eml` });
});
