import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { centralDb } from "../db/central/client";
import { apiKey, app, member, sendingDomain, user, workspace } from "../db/central/schema";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import { createApiKey } from "./api-keys";

export type SeedInput = {
  ownerEmails: string[];
  workspace: { name: string; slug: string };
  app: { name: string; slug: string };
  domain?: { domain: string; sesRegion: string };
};
export type SeedResult = { workspaceId: string; appId: string; apiKey: string };

const text = z.string().min(1);
export const seedInputSchema = z.object({
  ownerEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1),
  workspace: z.object({ name: text, slug: text }),
  app: z.object({ name: text, slug: text }),
  domain: z.object({ domain: text, sesRegion: text }).optional(),
});

// Writes run in one D1 batch, which is all-or-nothing. The api key is created after the batch,
// so a rerun issues one whenever the app has no live key.
export async function seed(env: Env, input: SeedInput): Promise<SeedResult> {
  const db = centralDb(env);
  const emails = [...new Set(input.ownerEmails.map((e) => e.trim().toLowerCase()))];
  const writes: BatchItem<"sqlite">[] = [];

  const userIds = new Map<string, string>();
  for (const row of await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.email, emails))) {
    userIds.set(row.email, row.id);
  }
  const newUsers = emails
    .filter((email) => !userIds.has(email))
    .map((email) => {
      const id = newId("usr");
      userIds.set(email, id);
      return { id, name: email, email, role: "admin" as const };
    });
  if (newUsers.length) writes.push(db.insert(user).values(newUsers));
  writes.push(db.update(user).set({ role: "admin" }).where(inArray(user.email, emails)));

  const [existingWorkspace] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(eq(workspace.slug, input.workspace.slug));
  const workspaceId = existingWorkspace?.id ?? newId("wsp");
  if (!existingWorkspace) {
    writes.push(db.insert(workspace).values({ id: workspaceId, name: input.workspace.name, slug: input.workspace.slug }));
  }

  const ownerIds = [...userIds.values()];
  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), inArray(member.userId, ownerIds)));
  const memberOf = new Set(members.map((m) => m.userId));
  const newMembers = ownerIds
    .filter((userId) => !memberOf.has(userId))
    .map((userId) => ({ id: newId("mbr"), organizationId: workspaceId, userId, role: "owner" }));
  if (newMembers.length) writes.push(db.insert(member).values(newMembers));

  const [existingApp] = await db
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.workspaceId, workspaceId), eq(app.slug, input.app.slug)));
  const appId = existingApp?.id ?? newId("app");
  if (!existingApp) {
    writes.push(db.insert(app).values({ id: appId, workspaceId, name: input.app.name, slug: input.app.slug }));
  }

  if (input.domain) {
    const domain = input.domain.domain.trim().toLowerCase();
    const [existingDomain] = await db
      .select({ workspaceId: sendingDomain.workspaceId })
      .from(sendingDomain)
      .where(eq(sendingDomain.domain, domain));
    if (existingDomain && existingDomain.workspaceId !== workspaceId) {
      throw new Error("domain belongs to another workspace");
    }
    if (!existingDomain) {
      writes.push(db.insert(sendingDomain).values({ id: newId("dom"), workspaceId, domain, sesRegion: input.domain.sesRegion }));
    }
  }

  if (writes.length) await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  const liveKey = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.appId, appId), isNull(apiKey.revokedAt)))
    .get();
  const secret = liveKey ? "" : (await createApiKey(env, { workspaceId, appId, name: "seed" })).secret;
  return { workspaceId, appId, apiKey: secret };
}

// Returns the response to send when the request must not reach seed, or null to continue.
// Constant-time compare: workers-types does not type crypto.subtle.timingSafeEqual.
export function seedGuard(request: Request, env: Env): Response | null {
  if (!env.SEED_SECRET) return new Response(null, { status: 404 });
  const expected = new TextEncoder().encode(`Bearer ${env.SEED_SECRET}`);
  const given = new TextEncoder().encode(request.headers.get("authorization") ?? "");
  let diff = expected.length ^ given.length;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ (given[i % given.length] ?? 0);
  return diff === 0 ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
