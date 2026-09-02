/**
 * RFC 5322 Message-ID helpers. Pure — no DB.
 * Outbound thread key is the letter’s own Message-ID.
 * Inbound (Plan 3) walks References to the root, then In-Reply-To, then its own id.
 * Subject (`Re:`) is never a thread key.
 */

function innerId(raw: string): string {
  let t = raw.trim();
  while (t.startsWith("<") || t.endsWith(">")) {
    if (t.startsWith("<")) t = t.slice(1).trimStart();
    if (t.endsWith(">")) t = t.slice(0, -1).trimEnd();
  }
  return t;
}

export function generateRelayMessageId(): string {
  const id = globalThis.crypto.randomUUID();
  return `<${id}@relay.invalid>`;
}

/** Canonical `<id@host>` or null. Never throws. */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const inner = innerId(String(raw));
  if (!inner) return null;
  return `<${inner}>`;
}

export function parseMessageIdList(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  const parts = String(raw).split(/[\s,]+/);
  const ids: string[] = [];
  for (const part of parts) {
    const id = normalizeMessageId(part);
    if (id) ids.push(id);
  }
  return ids;
}

export function threadIdForOutbound(input: { rfcMessageId: string }): string {
  return normalizeMessageId(input.rfcMessageId) ?? input.rfcMessageId.trim();
}

export function threadIdForInbound(input: {
  inReplyTo?: string | null;
  references?: string | null;
  fallback: string;
  /** Ignored — headers win. Present so callers cannot “fix” threads with Re: subjects. */
  subject?: string | null;
}): string {
  const refs = parseMessageIdList(input.references);
  if (refs[0]) return refs[0];
  const parent = normalizeMessageId(input.inReplyTo);
  if (parent) return parent;
  return normalizeMessageId(input.fallback) ?? generateRelayMessageId();
}

export function mailboxThreadingFromProviderId(providerMessageId: string | null | undefined): {
  rfcMessageId: string;
  threadId: string;
} {
  const rfcMessageId = normalizeMessageId(providerMessageId) ?? generateRelayMessageId();
  return { rfcMessageId, threadId: threadIdForOutbound({ rfcMessageId }) };
}
