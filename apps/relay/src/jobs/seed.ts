import { and, eq, inArray, sql } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { sendingDomain } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { apiKey, app, member, user, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { createAuth } from "../auth";
import { writeAudit } from "../auth/audit";
import { newId } from "../shared/ids";
import type { SeedInput } from "../core/ops-params";
import { readDomainState } from "../services/domain-state";
import { createApp } from "../core/apps";

import { createApiKey } from "../services/api-keys";
import { isProtectedDomain } from "../core/protected-domains";

export type SeedResult = { workspaceId: string; appId: string; apiKey: string };

// Each better-auth call commits on its own, so a failure part-way leaves rows that a rerun completes: every step
// looks up before it writes. Reads and the domain check come first, so a refused domain writes nothing.
// setRole needs an admin session, so existing users are promoted through the internal adapter, with the same
// role.change audit row the set-role hook writes.
export async function seed(env: Env, input: SeedInput): Promise<SeedResult> {
  const db = securityDb(env);
  const auth = createAuth(env);
  const emails = [...new Set(input.ownerEmails.map((e) => e.trim().toLowerCase()))];

  const existingUsers = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(inArray(user.email, emails));
  const [existingWorkspace] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(eq(workspace.slug, input.workspace.slug));
  const domain = input.domain && { ...input.domain, domain: input.domain.domain.trim().toLowerCase() };
  const [existingDomain] = domain
    ? await coreDb(env).select({ workspaceId: sendingDomain.workspaceId }).from(sendingDomain).where(eq(sendingDomain.domain, domain.domain))
    : [];
  if (existingDomain && existingDomain.workspaceId !== existingWorkspace?.id) {
    throw new Error("domain belongs to another workspace");
  }

  const found = new Map(existingUsers.map((row) => [row.email, row]));
  const ownerIds: string[] = [];
  for (const email of emails) {
    const row = found.get(email);
    if (!row) {
      const created = await auth.api.createUser({ body: { email, name: email, role: "admin" } });
      ownerIds.push(created.user.id);
      continue;
    }
    ownerIds.push(row.id);
    if (row.role !== "admin") {
      await (await auth.$context).internalAdapter.updateUser(row.id, { role: "admin" });
      await writeAudit(env, { action: "role.change", target: row.id, data: { role: "admin" } });
    }
  }

  let workspaceId = existingWorkspace?.id;
  if (!workspaceId) {
    const organization = await auth.api.createOrganization({
      body: { name: input.workspace.name, slug: input.workspace.slug, userId: ownerIds[0] },
    });
    workspaceId = organization.id;
  }

  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), inArray(member.userId, ownerIds)));
  const memberOf = new Set(members.map((m) => m.userId));
  for (const userId of ownerIds) {
    if (!memberOf.has(userId)) await auth.api.addMember({ body: { userId, organizationId: workspaceId, role: "owner" } });
  }

  const [existingApp] = await db
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.workspaceId, workspaceId), eq(app.slug, input.app.slug)));
  const appId = existingApp?.id ?? (await createApp(env, { workspaceId, ...input.app })).id;

  if (domain && !existingDomain) {
    // The identity was not created by Relay, so the row records its real SES state and is never released with it.
    const state = await readDomainState(env, domain.sesRegion, domain.domain);
    await coreDb(env)
      .insert(sendingDomain)
      .values({
        id: newId("dom"),
        workspaceId,
        domain: domain.domain,
        sesRegion: domain.sesRegion,
        ...state,
        verifiedAt: state.status === "verified" ? new Date() : null,
        protected: isProtectedDomain(env, domain.domain),
      });
  }
  const liveKey = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(sql`json_extract(${apiKey.metadata}, '$.appId') = ${appId}`, eq(apiKey.enabled, true)))
    .get();
  const secret = liveKey ? "" : (await createApiKey(env, { workspaceId, appId, name: "seed" })).secret;
  return { workspaceId, appId, apiKey: secret };
}
