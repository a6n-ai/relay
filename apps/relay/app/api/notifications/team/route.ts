import { desc } from "drizzle-orm";
import { handler, json } from "@foundry/routes";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { operatorGuard } from "@/lib/campaigns/http";

export const GET = handler(async () => {
  await operatorGuard();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return json(
    rows.map((r) => ({
      publicId: r.publicId,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status,
      createdAt: r.createdAt,
    })),
  );
});
