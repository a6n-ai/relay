import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { emailAttachment, emailMailbox } from "@/db/schema";
import { inScope, type MailboxScope } from "./scope";

export async function listAttachments(mailboxIds: bigint[]) {
  if (mailboxIds.length === 0) return [];
  return db
    .select({
      publicId: emailAttachment.publicId,
      mailboxId: emailAttachment.mailboxId,
      position: emailAttachment.position,
      filename: emailAttachment.filename,
      contentType: emailAttachment.contentType,
      sizeBytes: emailAttachment.sizeBytes,
      contentId: emailAttachment.contentId,
    })
    .from(emailAttachment)
    .where(inArray(emailAttachment.mailboxId, mailboxIds))
    .orderBy(asc(emailAttachment.mailboxId), asc(emailAttachment.position));
}

export async function readAttachment(scope: MailboxScope, publicId: string) {
  const [row] = await db
    .select({
      publicId: emailAttachment.publicId,
      filename: emailAttachment.filename,
      contentType: emailAttachment.contentType,
      sizeBytes: emailAttachment.sizeBytes,
      storageKey: emailAttachment.storageKey,
      letterPublicId: emailMailbox.publicId,
      tenantId: emailMailbox.tenantId,
      mailboxId: emailMailbox.mailboxId,
    })
    .from(emailAttachment)
    .innerJoin(emailMailbox, eq(emailAttachment.mailboxId, emailMailbox.id))
    .where(eq(emailAttachment.publicId, publicId))
    .limit(1);
  if (!row || !inScope(row, scope)) return null;
  const { letterPublicId, tenantId, mailboxId, ...attachment } = row;
  return { attachment, letter: { publicId: letterPublicId, tenantId } };
}

// Filename is the display name only; CR/LF and quotes are dropped so it cannot break out of the header.
// Non-ASCII names go in filename* because Headers rejects characters above 255.
export function downloadResponse(obj: { body: ReadableStream; size: number }, opts: { filename: string }): Response {
  const name = opts.filename.replace(/[\r\n"\\]/g, "");
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  // encodeURIComponent leaves these, and RFC 5987 attr-char does not allow them.
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const disposition =
    ascii === name
      ? `attachment; filename="${name}"`
      : `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Length": String(obj.size),
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
