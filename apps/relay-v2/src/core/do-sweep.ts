import { asc, gt, lt } from "drizzle-orm";
import { CLIENT_MIGRATIONS } from "../do/migrations";
import { centralDb } from "../db/central/client";
import { workspace } from "../db/central/schema";
import type { Env } from "../env";
import { clientFor } from "./messages";

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
  const db = centralDb(env);
  const failed: SweepResult["failed"] = [];
  let total = 0;
  let cursor = "";
  for (;;) {
    const page = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(gt(workspace.id, cursor))
      .orderBy(asc(workspace.id))
      .limit(500);
    if (page.length === 0) break;
    total += page.length;
    await forEachLimit(
      page.map((row) => row.id),
      concurrency,
      async (workspaceId) => {
        try {
          await clientFor(env, workspaceId).ping(workspaceId);
        } catch (err) {
          failed.push({ workspaceId, error: err instanceof Error ? err.message : String(err) });
        }
      },
    );
    cursor = page[page.length - 1].id;
  }
  const behind = (
    await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(lt(workspace.doSchemaVersion, CLIENT_MIGRATIONS.length))
  ).map((row) => row.id);
  return { total, upToDate: total - behind.length, behind, failed };
}
