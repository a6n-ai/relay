import { isAPIError } from "better-auth/api";
import type { Env } from "../env";
import { createAuth } from "../lib/auth";
import { assertSameOrigin, ConsoleError } from "./actor";

// The cap and the self-serve profile are set by the better-auth hooks, so this path cannot skip them.
export async function createWorkspace(env: Env, headers: Headers, input: { name: string; slug: string }): Promise<{ id: string }> {
  assertSameOrigin(env, headers);
  const auth = createAuth(env);
  try {
    const org = await auth.api.createOrganization({ headers, body: input });
    if (!org) throw new ConsoleError(400, "could not create workspace");
    await auth.api.setActiveOrganization({ headers, body: { organizationId: org.id } });
    return { id: org.id };
  } catch (err) {
    if (isAPIError(err) && (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403)) {
      throw new ConsoleError(err.statusCode, err.message);
    }
    throw err;
  }
}
