import { WorkerEntrypoint } from "cloudflare:workers";
import { resolveApiKey } from "../core/api-keys";
import { getMessageForScope, sendMessage } from "../core/messages";
import { sendInputSchema } from "../core/send-input";
import type { Env } from "../env";

// Module-level, not a method: WorkerEntrypoint exposes every method over RPC, private or not.
async function scopeOf(env: Env, apiKey: string) {
  const scope = await resolveApiKey(env, apiKey);
  if (!scope) throw new Error("unauthorized");
  return scope;
}

export class RelayRpc extends WorkerEntrypoint<Env> {
  async send(apiKey: string, input: unknown) {
    const scope = await scopeOf(this.env, apiKey);
    return sendMessage(this.env, scope, sendInputSchema.omit({ appId: true }).parse(input));
  }

  async getMessage(apiKey: string, id: string) {
    return getMessageForScope(this.env, await scopeOf(this.env, apiKey), id);
  }
}
