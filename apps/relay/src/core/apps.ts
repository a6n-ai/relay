import { securityDb } from "../db/security/client";
import { app } from "../db/security/schema";
import type { Env } from "../env";
import { newId } from "../lib/ids";

export async function createApp(
  env: Env,
  input: { workspaceId: string; name: string; slug: string },
): Promise<{ id: string }> {
  const id = newId("app");
  await securityDb(env).insert(app).values({ id, workspaceId: input.workspaceId, name: input.name, slug: input.slug });
  return { id };
}
