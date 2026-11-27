import { and, eq, inArray, or } from "drizzle-orm";
import { sanitizeEmailHtml } from "../core/sanitize-html";
import { clientFor } from "../do/client";
import { downloadResponse, PREVIEW_HEAD_BYTES, previewResponse, previewType } from "../core/download";
import type { AttachmentView } from "../do/types";
import { type MessageAccess, type MessageDetail, type MessageQuery } from "../do/console-reads";
import { decodeCursor } from "../core/cursor";
import { securityDb } from "../db/security/client";
import { addressGrant, member, team, teamMember } from "../db/security/schema";
import type { Env } from "../env";
import { allows } from "../lib/auth/permissions";
import { type ConsoleActor } from "../core/session";
import { RelayError } from "../shared/errors";
import { type MessageStatus } from "../shared/mail";

type ConsoleMessage = Omit<
  MessageDetail,
  "html" | "htmlKey" | "rawKey" | "claimedUntil" | "idempotencyKey" | "status"
> & {
  status: MessageStatus;
  htmlSafe: string | null;
  blockedRemote: number;
  hasRaw: boolean;
};

export async function messageAccess(env: Env, actor: ConsoleActor): Promise<MessageAccess> {
  const out = allows(actor.roles, { log: ["read"] });
  if (allows(actor.roles, { mailbox: ["manage"] })) return { out, inbound: "all" };
  if (!allows(actor.roles, { mailbox: ["read"] })) return { out, inbound: [] };
  return { out, inbound: await grantedAddressIds(env, actor) };
}

// Plain queries, no subquery: the member row, then the user's teams in this workspace, then the grants that name either.
export async function grantedAddressIds(env: Env, actor: ConsoleActor): Promise<string[]> {
  const db = securityDb(env);
  const [self] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, actor.workspaceId), eq(member.userId, actor.userId)));
  const teams = await db
    .select({ id: teamMember.teamId })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, actor.userId), eq(team.organizationId, actor.workspaceId)));
  // Without a grantee, the workspace filter alone would match every grant in it.
  if (!self && teams.length === 0) return [];
  const grantee = or(
    self ? eq(addressGrant.memberId, self.id) : undefined,
    teams.length > 0 ? inArray(addressGrant.teamId, teams.map((t) => t.id)) : undefined,
  );
  const rows = await db
    .select({ addressId: addressGrant.addressId })
    .from(addressGrant)
    .where(and(eq(addressGrant.workspaceId, actor.workspaceId), grantee));
  return [...new Set(rows.map((r) => r.addressId))];
}

export async function listMessagesFor(env: Env, actor: ConsoleActor, q: MessageQuery) {
  const access = await messageAccess(env, actor);
  const inboundAllowed = allows(actor.roles, { mailbox: ["read"] });
  if (q.direction === "out" ? !access.out : !inboundAllowed) throw new RelayError("forbidden");
  if (q.cursor !== undefined && !decodeCursor(q.cursor)) throw new RelayError("invalid cursor");
  const { rows, nextCursor } = await clientFor(env, actor.workspaceId).listMessages(
    actor.workspaceId,
    { ...q, email: q.email?.trim().toLowerCase() || undefined },
    access,
  );
  return { rows, nextCursor, restricted: Array.isArray(access.inbound) };
}

// A letter the reader may not see is a 404, the same as one that does not exist.
export async function getMessageFor(
  env: Env,
  actor: ConsoleActor,
  id: string,
  opts: { images: boolean },
): Promise<ConsoleMessage> {
  const access = await messageAccess(env, actor);
  const view = await clientFor(env, actor.workspaceId).getMessageDetail(actor.workspaceId, id, access);
  if (!view) throw new RelayError("not found");
  const { html, htmlKey, rawKey, claimedUntil, idempotencyKey, ...rest } = view;
  const inlined = html === null || !opts.images ? html : await inlineCidImages(env, actor, access, rest.id, html, rest.attachments);
  const safe = inlined === null ? null : sanitizeEmailHtml(inlined, { remoteImages: opts.images ? "allow" : "block" });
  return {
    ...rest,
    status: rest.status as MessageStatus,
    htmlSafe: safe?.html ?? null,
    blockedRemote: (safe?.blockedRemote ?? 0) + (html !== null && !opts.images ? heldCidImages(html, rest.attachments) : 0),
    hasRaw: rawKey !== null,
  };
}

const CID_SRC = /(\ssrc\s*=\s*)(["'])cid:([^"']*)\2/gi;
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const INLINE_MAX_BYTES = 512 * 1024;
const INLINE_BUDGET_BYTES = 2 * 1024 * 1024;

// Block mode drops cid: srcs silently, so count the ones show-images would inline; otherwise a letter with only inline images has no button.
function heldCidImages(html: string, attachments: AttachmentView[]): number {
  const inlineable = new Set(
    attachments.flatMap((a) =>
      a.contentId && INLINE_TYPES.has(a.contentType) && a.sizeBytes <= INLINE_MAX_BYTES ? [a.contentId.replace(/^<|>$/g, "").trim()] : [],
    ),
  );
  return [...html.matchAll(CID_SRC)].filter((m) => inlineable.has(m[3].trim())).length;
}

// Show-images only. The letter frame is an opaque-origin sandbox that cannot send this reader's session, so an inline
// image is written in as a data: URI from this letter's own attachments. Any other cid: src is left for the sanitiser to drop.
async function inlineCidImages(
  env: Env,
  actor: ConsoleActor,
  access: MessageAccess,
  messageId: string,
  html: string,
  attachments: AttachmentView[],
): Promise<string> {
  const byCid = new Map(attachments.flatMap((a) => (a.contentId ? [[a.contentId.replace(/^<|>$/g, "").trim(), a] as const] : [])));
  const images = new Map<string, { uri: string; size: number }>();
  // The budget also caps what is fetched, so a letter full of images never reads more than INLINE_BUDGET_BYTES.
  let fetched = 0;
  for (const cid of new Set([...html.matchAll(CID_SRC)].map((m) => m[3].trim()))) {
    const att = byCid.get(cid);
    if (!att || !INLINE_TYPES.has(att.contentType)) continue;
    if (att.sizeBytes > INLINE_MAX_BYTES || fetched + att.sizeBytes > INLINE_BUDGET_BYTES) continue;
    const file = await clientFor(env, actor.workspaceId).getMessageFile(actor.workspaceId, messageId, att.id, access);
    if (!file || !("key" in file) || !file.key.startsWith(`ws/${actor.workspaceId}/`)) continue;
    const object = await env.MAIL.get(file.key);
    if (!object) continue;
    if (object.size > INLINE_MAX_BYTES || fetched + object.size > INLINE_BUDGET_BYTES) {
      await object.body.cancel();
      continue;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    fetched += bytes.byteLength;
    images.set(cid, { uri: `data:${att.contentType};base64,${base64(bytes)}`, size: bytes.byteLength });
  }
  let total = 0;
  return html.replace(CID_SRC, (whole, lead: string, quote: string, cid: string) => {
    const img = images.get(cid.trim());
    if (!img || total + img.size > INLINE_BUDGET_BYTES) return whole;
    total += img.size;
    return `${lead}${quote}${img.uri}${quote}`;
  });
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// view=1 previews only what the first bytes prove is safe to show; anything else falls through to the download.
export async function messageFileFor(
  env: Env,
  actor: ConsoleActor,
  id: string,
  part: string,
  view = false,
): Promise<Response> {
  const access = await messageAccess(env, actor);
  const file = await clientFor(env, actor.workspaceId).getMessageFile(actor.workspaceId, id, part, access);
  if (!file) throw new RelayError("not found");
  if ("body" in file) {
    const bytes = new TextEncoder().encode(file.body);
    return downloadResponse(new Blob([bytes]).stream(), bytes.byteLength, file.name);
  }
  if (!file.key.startsWith(`ws/${actor.workspaceId}/`)) throw new RelayError("not found");
  if (view && file.contentType !== null) {
    // A zero-byte object makes R2 reject the range read; that falls through to the download like any non-preview.
    const head = await env.MAIL.get(file.key, { range: { offset: 0, length: PREVIEW_HEAD_BYTES } }).catch(() => null);
    const type = head && head.size > 0 ? previewType(new Uint8Array(await head.arrayBuffer()), file.contentType) : null;
    if (type) {
      const preview = await env.MAIL.get(file.key);
      if (!preview) throw new RelayError("not found");
      return previewResponse(preview.body, preview.size, file.name, type);
    }
  }
  const object = await env.MAIL.get(file.key);
  if (!object) throw new RelayError("not found");
  return downloadResponse(object.body, object.size, file.name);
}
