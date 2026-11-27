import { z } from "zod";
import { EMAIL_MAX, ID_MAX, NAME_MAX, SUBJECT_MAX } from "./limits";
import { STREAMS } from "./mail";

export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX).email();
export const idSchema = z.string().min(1).max(ID_MAX);
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const slugSchema = z.string().regex(SLUG_RE);

const noLineBreak = (s: string) => !/[\r\n]/.test(s);
// A subject becomes a mail header: a line break would split it.
const subjectLineSchema = z.string().refine(noLineBreak, "subject must not contain line breaks");
// Authored subjects (templates, campaigns) are capped; a send's subject is not, since a rendered template subject can be longer.
export const subjectSchema = subjectLineSchema.max(SUBJECT_MAX);

export const memberInput = z.object({
  email: emailSchema,
  firstName: z.string().trim().max(NAME_MAX).optional(),
  lastName: z.string().trim().max(NAME_MAX).optional(),
  consentAt: z.number().int().positive().refine((at) => at <= Date.now(), "consentAt is in the future").optional(),
});

export type MemberInput = z.output<typeof memberInput>;

const streamSchema = z.enum(STREAMS);

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
// Decoded size is derived from the length, so an oversized upload is refused before it is decoded.
// A grouped regex overflows the V8 stack on a multi-megabyte string, so the shape check is a flat class.
const base64Content = z
  .string()
  .refine((c) => c.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(c), "attachment content must be base64")
  .refine((c) => (c.length / 4) * 3 - (c.endsWith("==") ? 2 : c.endsWith("=") ? 1 : 0) <= MAX_ATTACHMENT_BYTES, "attachment exceeds 5 MB");
const attachmentSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(200)
    .refine((s) => !/[\/\\\r\n]/.test(s), "filename must not contain path separators or line breaks"),
  contentType: z.string().min(1).max(100).refine(noLineBreak, "contentType must not contain line breaks"),
  content: base64Content,
});

const sendInputSchema = z.object({
  appId: z.string().min(1),
  stream: streamSchema,
  // Omitted: the app's default sender for the stream is used (services/messages.ts).
  from: emailSchema.optional(),
  to: emailSchema,
  // The subject becomes a mail header: a line break would split it, so it is refused here, not at SES.
  subject: subjectLineSchema.min(1),
  html: z.string(),
  text: z.string(),
  event: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  fromName: z.string().max(100).refine(noLineBreak, "fromName must not contain line breaks").optional(),
  replyTo: emailSchema.optional(),
  attachments: z.array(attachmentSchema).max(3).optional(),
});

export const sendBody = sendInputSchema.omit({ appId: true, campaignId: true });

export type SendInput = z.input<typeof sendInputSchema>;

// What the client DO receives: the sender is always resolved by then.
export const resolvedSendSchema = sendInputSchema.extend({ from: emailSchema });
export type ResolvedSendInput = z.input<typeof resolvedSendSchema>;

export const mergeDataSchema = z
  .record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.string().max(200))
  .refine((d) => Object.keys(d).length <= 10, "at most 10 data keys");

const contactSchema = z.object({ firstName: z.string().max(200).optional(), lastName: z.string().max(200).optional() });

export const templateSendSchema = z.object({
  stream: streamSchema,
  from: emailSchema.optional(),
  to: emailSchema,
  templateId: z.string().min(1),
  contact: contactSchema.optional(),
  data: mergeDataSchema.optional(),
  event: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export type TemplateSendInput = z.input<typeof templateSendSchema>;
