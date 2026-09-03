import { handler, json } from "@foundry/routes";
import { operatorGuard } from "@/lib/campaigns/http";
import { listMailboxLetters } from "@/lib/mailbox/list";
import { mailboxLetterJson } from "@/lib/mailbox/http-json";

export const GET = handler(async () => {
  await operatorGuard();
  const rows = await listMailboxLetters();
  return json(rows.map(mailboxLetterJson));
});
