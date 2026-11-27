import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { coreDb } from "../db/core/client";
import { usageDaily, workspaceProfile } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { workspace } from "../db/security/schema";
import type { Env } from "../env";
import { createAuth } from "../auth";
import { workspaceHoldings } from "../core/workspace-holdings";
import { assertSameOrigin } from "../auth/session";
import type { Principal } from "./principal";
import { RelayError } from "../shared/errors";

// The cap and the self-serve profile are set by the better-auth hooks, so this path cannot skip them.
export async function createWorkspace(env: Env, headers: Headers, input: { name: string; slug: string }): Promise<{ id: string }> {
  assertSameOrigin(env, headers);
  const auth = createAuth(env);
  try {
    const org = await auth.api.createOrganization({ headers, body: input });
    if (!org) throw new RelayError("could not create workspace");
    await auth.api.setActiveOrganization({ headers, body: { organizationId: org.id } });
    return { id: org.id };
  } catch (err) {
    if (isAPIError(err) && (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403)) {
      throw new RelayError("invalid input", err.statusCode, err.message);
    }
    throw err;
  }
}

// The slug stays: it is the workspace's address.
export async function renameWorkspace(env: Env, p: Principal, headers: Headers, name: string): Promise<void> {
  try {
    await createAuth(env).api.updateOrganization({ headers, body: { organizationId: p.workspaceId, data: { name } } });
  } catch (err) {
    if (isAPIError(err) && err.statusCode < 500) throw new RelayError("invalid input", err.statusCode === 403 || err.statusCode === 404 ? err.statusCode : 400, err.message);
    throw err;
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Apps and domains hold Durable Object data, SES identities and sending keys, so they must go first. Only the owner holds organization:delete.
export async function deleteWorkspace(env: Env, p: Principal, headers: Headers, slug: string): Promise<void> {
  const [row] = await securityDb(env).select({ slug: workspace.slug }).from(workspace).where(eq(workspace.id, p.workspaceId));
  if (!row || row.slug !== slug) throw new RelayError("slug does not match");
  const { apps, domains } = await workspaceHoldings(env, p.workspaceId);
  const left = [apps > 0 ? plural(apps, "app") : "", domains > 0 ? plural(domains, "domain") : ""].filter(Boolean);
  if (left.length > 0) throw new RelayError("invalid input", 409, `Remove its ${left.join(" and ")} first.`);
  try {
    await createAuth(env).api.deleteOrganization({ headers, body: { organizationId: p.workspaceId } });
  } catch (err) {
    if (isAPIError(err) && err.statusCode < 500) throw new RelayError("invalid input", err.statusCode === 403 || err.statusCode === 404 ? err.statusCode : 400, err.message);
    throw err;
  }
  // relay-core has no foreign keys to the workspace, so its rows go here.
  await coreDb(env).delete(workspaceProfile).where(eq(workspaceProfile.workspaceId, p.workspaceId));
  await coreDb(env).delete(usageDaily).where(eq(usageDaily.workspaceId, p.workspaceId));
}
