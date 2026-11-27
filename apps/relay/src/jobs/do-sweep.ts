import { asc, gt, gte } from "drizzle-orm";
import { CLIENT_MIGRATIONS } from "../do/migrations";
import { coreDb } from "../db/core/client";
import { workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { workspace } from "../db/security/schema";
import type { Env } from "../env";
import { clientFor } from "../do/client";

export type SweepResult = {
  total: number;
  upToDate: number;
  behind: string[];
  failed: { workspaceId: string; error: string }[];
};

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// Wakes every workspace's ClientDO so it reports its schema version, then lists the ones still behind.
export async function sweepWorkspaces(env: Env, { concurrency = 10 }: { concurrency?: number } = {}): Promise<SweepResult> {
  const db = securityDb(env);
  const failed: SweepResult["failed"] = [];
  const ids: string[] = [];
  let cursor = "";
  for (;;) {
    const page = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(gt(workspace.id, cursor))
      .orderBy(asc(workspace.id))
      .limit(500);
    if (page.length === 0) break;
    const pageIds = page.map((row) => row.id);
    ids.push(...pageIds);
    await forEachLimit(pageIds, concurrency, async (workspaceId) => {
      try {
        await clientFor(env, workspaceId).ping(workspaceId);
      } catch (err) {
        failed.push({ workspaceId, error: err instanceof Error ? err.message : String(err) });
      }
    });
    cursor = page[page.length - 1].id;
  }
  // A workspace with no profile row has never reported a version, so it counts as behind.
  const current = new Set(
    (
      await coreDb(env)
        .select({ workspaceId: workspaceProfile.workspaceId })
        .from(workspaceProfile)
        .where(gte(workspaceProfile.doSchemaVersion, CLIENT_MIGRATIONS.length))
    ).map((row) => row.workspaceId),
  );
  const behind = ids.filter((id) => !current.has(id));
  return { total: ids.length, upToDate: ids.length - behind.length, behind, failed };
}
