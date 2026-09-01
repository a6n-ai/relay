import { z } from "zod";

export const messageBodySchema = z.object({
  kind: z.enum(["transactional", "marketing"]).optional(),
  channels: z.array(z.enum(["email", "in_app", "sms", "whatsapp"])).optional(),
  to: z.object({
    userId: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  event: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  href: z.string().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

export type MessageBody = z.infer<typeof messageBodySchema>;

export type ParseMessageResult =
  | { ok: true; data: MessageBody }
  | { ok: false; status: number; title: string; issues?: unknown };

export function parseMessageJson(json: unknown): ParseMessageResult {
  const parsed = messageBodySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: 400, title: "Invalid body", issues: parsed.error.issues };
  }
  const input = parsed.data;
  if (!input.to.email && !input.to.phone && !input.to.userId) {
    return { ok: false, status: 400, title: "Recipient required" };
  }
  return { ok: true, data: input };
}
