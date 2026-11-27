import type * as schema from "./client-schema";

export type AttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  position: number;
};

export type MessageView = typeof schema.message.$inferSelect & { html: string | null; attachments: AttachmentView[] };

export type SendResult = { messageId: string; status: "queued" | "sent" | "failed" | "suppressed"; duplicate: boolean };
