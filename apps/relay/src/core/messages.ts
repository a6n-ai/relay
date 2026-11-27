import { and, eq } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { app } from "../db/security/schema";
import type { Env } from "../env";
import type { KeyScope } from "./api-keys";
import { ApiError } from "./api-error";
import { loadWorkspaceLimits } from "./limits";
import { contactValues, hasMergeToken } from "./merge";
import { templateSendSchema, type SendInput, type Stream, type TemplateSendInput } from "./send-input";

export type Scope = { workspaceId: string; appId: string };

export class TemplateError extends Error {}
export const TEMPLATE_ERROR_STATUS = {
  "template not found": 404,
  "template disabled": 409,
  "unsubscribe only on marketing": 400,
} as const;

export function clientFor(env: Env, workspaceId: string) {
  return env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
}

export const SEND_REFUSAL_STATUS = { quota_exceeded: 429, workspace_suspended: 403, sender_not_verified: 422, no_default_sender: 422 } as const;
export type SendRefusal = keyof typeof SEND_REFUSAL_STATUS;

export function sendRefusal(err: unknown): SendRefusal | undefined {
  return err instanceof Error && Object.hasOwn(SEND_REFUSAL_STATUS, err.message) ? (err.message as SendRefusal) : undefined;
}

// The default is an address id in relay-core; whether it can send is checked by the client DO like any explicit from.
async function defaultSender(env: Env, scope: Scope, stream: Stream): Promise<string> {
  const [row] = await securityDb(env)
    .select({ transactional: app.defaultTransactionalAddressId, marketing: app.defaultMarketingAddressId })
    .from(app)
    .where(and(eq(app.id, scope.appId), eq(app.workspaceId, scope.workspaceId)));
  const addressId = stream === "marketing" ? row?.marketing : row?.transactional;
  const [found] = addressId
    ? await coreDb(env)
        .select({ email: address.email })
        .from(address)
        .where(and(eq(address.id, addressId), eq(address.workspaceId, scope.workspaceId)))
    : [];
  // A refusal code, not an ApiError: HTTP maps it to 422 and RPC callers match the same string.
  if (!found) throw new Error("no_default_sender");
  return found.email;
}

export async function sendMessage(env: Env, scope: Scope, input: Omit<SendInput, "appId">) {
  // CASL: marketing mail must carry the opt-out in both bodies, or the recipient has no way to stop it.
  if (input.stream === "marketing" && !(hasMergeToken(input.html, "unsubscribe_url") && hasMergeToken(input.text, "unsubscribe_url"))) {
    throw new ApiError(400, "unsubscribe link required");
  }
  const from = input.from ?? (await defaultSender(env, scope, input.stream));
  return clientFor(env, scope.workspaceId).send(scope.workspaceId, { ...input, from, appId: scope.appId });
}

export async function sendTemplateMessage(env: Env, scope: Scope, input: TemplateSendInput) {
  const data = templateSendSchema.parse(input);
  const { postalAddress } = await loadWorkspaceLimits(env, scope.workspaceId);
  const values = contactValues(
    { email: data.to, firstName: data.contact?.firstName ?? null, lastName: data.contact?.lastName ?? null, data: data.data },
    postalAddress ?? "",
  );
  const rendered = await clientFor(env, scope.workspaceId).renderTemplate(scope.workspaceId, scope.appId, data.templateId, values);
  if (rendered === "missing") throw new TemplateError("template not found");
  if (rendered === "disabled") throw new TemplateError("template disabled");
  if (rendered.hasUnsubscribe && data.stream !== "marketing") throw new TemplateError("unsubscribe only on marketing");
  return sendMessage(env, scope, {
    stream: data.stream,
    from: data.from,
    to: data.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    event: data.event,
    idempotencyKey: data.idempotencyKey,
  });
}

export async function getMessageForScope(env: Env, scope: Scope, id: string) {
  const view = await clientFor(env, scope.workspaceId).getMessage(scope.workspaceId, id);
  return view?.appId === scope.appId ? view : null;
}

// The brand opt-out applies when the sending address is given, so a request names its From to get the brand rule.
export function isSuppressedForScope(env: Env, scope: KeyScope, email: string, streamName: Stream, from?: string): Promise<boolean> {
  return clientFor(env, scope.workspaceId).isSuppressed(scope.workspaceId, email, streamName, from);
}
