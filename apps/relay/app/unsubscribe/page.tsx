import { handleUnsubscribe } from "@relay/engine";
import { db } from "@/db/client";
import { campaignTables, notificationTables } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string; token?: string }>;
}) {
  const q = await searchParams;
  const secret = process.env.RELAY_UNSUBSCRIBE_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "";
  await handleUnsubscribe(
    db,
    { ...notificationTables, ...campaignTables } as never,
    { address: q.address ?? null, token: q.token ?? null, secret },
  );

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-2 px-6">
      <h1 className="text-lg font-semibold">Unsubscribed</h1>
      <p className="text-muted-foreground text-sm">
        You will not receive further marketing messages at this address. Transactional mail (receipts, security) may still be sent.
      </p>
    </main>
  );
}
