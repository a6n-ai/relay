import { and, eq } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { app } from "../db/security/schema";
import type { Env } from "../env";
import type { KeyPrincipal } from "./principal";
import { clientFor } from "../do/client";
import { loadWorkspaceLimits } from "../core/limits";
import { contactValues, hasMergeToken } from "../shared/merge";
import { templateSendSchema, type SendInput, type TemplateSendInput } from "../shared/schemas";
import { RelayError } from "../shared/errors";
import { type Stream } from "../shared/mail";

// The default is an address id in relay-core; whether it can send is checked by the client DO like any explicit from.
async function defaultSender(env: Env, p: KeyPrincipal, stream: Stream): Promise<string> {
  const [row] = await securityDb(env)
    .select({ transactional: app.defaultTransactionalAddressId, marketing: app.defaultMarketingAddressId })
    .from(app)
    .where(and(eq(app.id, p.appId), eq(app.workspaceId, p.workspaceId)));
  const addressId = stream === "marketing" ? row?.marketing : row?.transactional;
  const [found] = addressId
    ? await coreDb(env)
        .select({ email: address.email })
        .from(address)
        .where(and(eq(address.id, addressId), eq(address.workspaceId, p.workspaceId)))
    : [];
  if (!found) throw new RelayError("no_default_sender");
  return found.email;
}

export async function sendMessage(env: Env, p: KeyPrincipal, input: Omit<SendInput, "appId">) {
  // CASL: marketing mail must carry the opt-out in both bodies, or the recipient has no way to stop it.
  if (input.stream === "marketing" && !(hasMergeToken(input.html, "unsubscribe_url") && hasMergeToken(input.text, "unsubscribe_url"))) {
    throw new RelayError("unsubscribe link required");
  }
  const from = input.from ?? (await defaultSender(env, p, input.stream));
  return clientFor(env, p.workspaceId).send(p.workspaceId, { ...input, from, appId: p.appId });
}

export async function sendTemplateMessage(env: Env, p: KeyPrincipal, input: TemplateSendInput) {
  const data = templateSendSchema.parse(input);
  const { postalAddress } = await loadWorkspaceLimits(env, p.workspaceId);
  const values = contactValues(
    { email: data.to, firstName: data.contact?.firstName ?? null, lastName: data.contact?.lastName ?? null, data: data.data },
    postalAddress ?? "",
  );
  const rendered = await clientFor(env, p.workspaceId).renderTemplate(p.workspaceId, p.appId, data.templateId, values);
  if (rendered === "missing") throw new RelayError("template not found");
  if (rendered === "disabled") throw new RelayError("template disabled");
  if (rendered.hasUnsubscribe && data.stream !== "marketing") throw new RelayError("unsubscribe only on marketing");
  return sendMessage(env, p, {
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

export async function getMessage(env: Env, p: KeyPrincipal, id: string) {
  const view = await clientFor(env, p.workspaceId).getMessage(p.workspaceId, id);
  return view?.appId === p.appId ? view : null;
}

// The brand opt-out applies when the sending address is given, so a request names its From to get the brand rule.
export function isSuppressed(env: Env, p: KeyPrincipal, email: string, stream: Stream, from?: string): Promise<boolean> {
  return clientFor(env, p.workspaceId).isSuppressed(p.workspaceId, email, stream, from);
}

export function unsubscribeMessage(env: Env, workspaceId: string, messageId: string) {
  return clientFor(env, workspaceId).unsubscribe(workspaceId, messageId);
}
