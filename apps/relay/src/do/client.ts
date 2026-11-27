import type { Env } from "../env";

export function clientFor(env: Env, workspaceId: string) {
  return env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
}
