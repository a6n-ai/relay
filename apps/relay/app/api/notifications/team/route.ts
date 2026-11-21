import { desc, eq } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { db } from "@/db/client";
import { member, users } from "@/db/schema";
import { operatorGuard } from "@/lib/campaigns/http";
import { workspaceSlug } from "@/lib/mailbox/scope";

/** Members of the caller's active workspace only; never other workspaces' people. */
export const GET = handler(async () => {
  await operatorGuard();
  const workspace = await workspaceSlug();
  if (!workspace) throw new NotFoundError("No active workspace");
  const rows = await db
    .select({
      publicId: users.publicId,
      email: users.email,
      name: users.name,
      role: member.role,
      status: users.status,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, workspace.id))
    .orderBy(desc(member.createdAt));
  return json(rows);
});
