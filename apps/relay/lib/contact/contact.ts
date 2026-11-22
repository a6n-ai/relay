import { escapeHtml, type ParsedInboundLetter } from "@relay/engine";
import { z } from "zod";

export const CONTACT_MAX_BYTES = 16_384;

export const VOLUMES = [
  { value: "under_10k", label: "Under 10k" },
  { value: "10k_100k", label: "10k–100k" },
  { value: "100k_1m", label: "100k–1M" },
  { value: "over_1m", label: "Over 1M" },
] as const satisfies readonly { value: string; label: string }[];

const volumeValues = VOLUMES.map((v) => v.value) as [(typeof VOLUMES)[number]["value"], ...(typeof VOLUMES)[number]["value"][]];

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().max(254).email(),
  company: z.string().trim().min(1).max(200),
  volume: z.enum(volumeValues),
  message: z.string().trim().min(10).max(4000),
  website: z.string().optional(),
  token: z.string().min(1),
});

export type ContactInput = z.output<typeof contactSchema>;

const FOOTER = "Sent from the relay.a6n.ai contact form. The email address was not verified.";

export function buildContactLetter(
  input: ContactInput,
  opts: { inbox: string; now: number; id: string },
): ParsedInboundLetter {
  const volumeLabel = VOLUMES.find((v) => v.value === input.volume)!.label;
  const fields: [string, string][] = [
    ["Name", input.name],
    ["Email", input.email],
    ["Company", input.company],
    ["Volume", volumeLabel],
  ];
  const html =
    fields.map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v)}</p>`).join("") +
    `<p><strong>Message:</strong><br>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>` +
    `<p>${FOOTER}</p>`;
  const text = [...fields.map(([k, v]) => `${k}: ${v}`), "", input.message, "", FOOTER].join("\n");

  return {
    fromEmail: input.email,
    fromName: input.name,
    toEmail: opts.inbox,
    subject: `Website: ${input.company}`,
    html,
    text,
    rfcMessageId: `<contact-${opts.id}@relay.a6n.ai>`,
    inReplyTo: null,
    rfcReferences: null,
    sentAt: opts.now,
  };
}
