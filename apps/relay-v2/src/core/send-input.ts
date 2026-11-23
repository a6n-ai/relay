import { z } from "zod";

export const streamSchema = z.enum(["transactional", "tracked", "marketing"]);
export type Stream = z.infer<typeof streamSchema>;

export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual";

const email = z.string().trim().toLowerCase().pipe(z.email());

export const sendInputSchema = z.object({
  appId: z.string().min(1),
  stream: streamSchema,
  from: email,
  to: email,
  // The subject becomes a mail header: a line break would split it, so it is refused here, not at SES.
  subject: z.string().min(1).refine((s) => !/[\r\n]/.test(s), "subject must not contain line breaks"),
  html: z.string(),
  text: z.string(),
  event: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
});

export type SendInput = z.input<typeof sendInputSchema>;
