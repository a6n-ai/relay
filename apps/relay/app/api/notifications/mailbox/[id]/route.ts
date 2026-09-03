import { handler, json } from "@foundry/routes";
import { operatorGuard } from "@/lib/campaigns/http";
import { mailboxLetterDetailJson } from "@/lib/mailbox/http-json";
import { readMailboxLetter } from "@/lib/mailbox/list";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await operatorGuard();
  const { id } = await ctx.params;
  const row = await readMailboxLetter(id);
  if (!row) return json({ title: "Not found", status: 404 }, 404);
  return json(mailboxLetterDetailJson(row));
});
