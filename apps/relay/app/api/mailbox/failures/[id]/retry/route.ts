import { NotFoundError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { operatorGuard } from "@/lib/campaigns/http";
import { retryInboundFailure } from "@/lib/mailbox/failures";
import { mailboxScope } from "@/lib/mailbox/scope";

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await operatorGuard();
  const { id } = await ctx.params;
  const result = await retryInboundFailure(await mailboxScope(), id);
  if (!result) throw new NotFoundError("Not found");
  return json(result);
});
