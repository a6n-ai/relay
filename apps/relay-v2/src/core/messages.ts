import type { Env } from "../env";
import type { SendInput } from "./send-input";

export type Scope = { workspaceId: string; appId: string };

export function clientFor(env: Env, workspaceId: string) {
  return env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
}

export function sendMessage(env: Env, scope: Scope, input: Omit<SendInput, "appId">) {
  return clientFor(env, scope.workspaceId).send(scope.workspaceId, { ...input, appId: scope.appId });
}

export async function getMessageForScope(env: Env, scope: Scope, id: string) {
  const view = await clientFor(env, scope.workspaceId).getMessage(scope.workspaceId, id);
  return view?.appId === scope.appId ? view : null;
}
