import { handler, json } from "@foundry/routes";
import { operatorGuard } from "@/lib/campaigns/http";
import { listMailboxLetters } from "@/lib/mailbox/list";
import { mailboxLetterJson } from "@/lib/mailbox/http-json";
import { mailboxScope } from "@/lib/mailbox/scope";

export const GET = handler(async () => {
  await operatorGuard({ mailbox: ["read"] });
  const rows = await listMailboxLetters(await mailboxScope());
  return json(rows.map(mailboxLetterJson));
});
