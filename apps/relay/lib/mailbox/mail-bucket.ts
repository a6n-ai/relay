import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isWorkers } from "@foundry/commons/runtime/platform";

export type MailBucket = {
  put(key: string, body: ReadableStream | ArrayBuffer | Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(keys: string | string[]): Promise<void>;
  list(opts: { prefix: string }): Promise<{ objects: { key: string }[] }>;
};

const memory = new Map<string, Uint8Array<ArrayBuffer>>();

const memoryBucket: MailBucket = {
  async put(key, body) {
    memory.set(key, new Uint8Array(body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body));
  },
  async get(key) {
    const bytes = memory.get(key);
    return bytes ? { body: new Blob([bytes]).stream(), size: bytes.byteLength } : null;
  },
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) memory.delete(key);
  },
  async list({ prefix }) {
    return { objects: [...memory.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
  },
};

export function mailBucket(): MailBucket {
  return isWorkers() ? (getCloudflareContext().env as unknown as { MAIL: MailBucket }).MAIL : memoryBucket;
}

export function inboundRawKey(rawId: string, at: number): string {
  const day = new Date(at);
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  return `mail/in/${day.getUTCFullYear()}/${mm}/${rawId}.eml`;
}

export function inboundAttachmentKey(rawId: string, index: number, name: string): string {
  return `mail/att/${rawId}/${index}-${safeFilename(name)}`;
}

export function outboundAttachmentKey(letterPublicId: string, index: number, name: string): string {
  return `mail/out/${letterPublicId}/${index}-${safeFilename(name)}`;
}

/** Keeps the last extension of up to 10 characters (dot included); the stem is cut so the result is at most 100. */
export function safeFilename(name: string | null): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/["'\u0000-\u001f\u007f-\u009f]/g, "").trim();
  const dot = clean.lastIndexOf(".");
  const hasExt = dot > 0 && clean.length - dot <= 10;
  const ext = hasExt ? clean.slice(dot) : "";
  const stem = hasExt ? clean.slice(0, dot) : clean;
  return `${stem.slice(0, 100 - ext.length)}${ext}` || "file";
}
