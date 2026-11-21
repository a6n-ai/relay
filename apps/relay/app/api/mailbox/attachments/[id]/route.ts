import { NotFoundError } from "@foundry/commons";
import { handler } from "@foundry/routes";
import { operatorGuard } from "@/lib/campaigns/http";
import { downloadResponse, readAttachment } from "@/lib/mailbox/attachments";
import { mailBucket } from "@/lib/mailbox/mail-bucket";
import { mailboxScope } from "@/lib/mailbox/scope";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await operatorGuard({ mailbox: ["read"] });
  const { id } = await ctx.params;
  const found = await readAttachment(await mailboxScope(), id);
  if (!found) throw new NotFoundError("Not found");
  const obj = await mailBucket().get(found.attachment.storageKey);
  if (!obj) throw new NotFoundError("Not found");
  return downloadResponse(obj, { filename: found.attachment.filename });
});
