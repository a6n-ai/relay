"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { cn } from "@foundry/ui/cn";
import { apiFetch } from "./api-fetch";
import { CampaignAttachments, type CampaignAttachment } from "./campaign-attachments";
import { EmailContentEditor, type EmailContentEditorHandle } from "./email-content-editor";
import { AudienceBuilder, type AudienceValue, type ContactListOption } from "./audience-builder";

const CHANNELS = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
] as const;

type ChannelKey = (typeof CHANNELS)[number]["key"];

// materializeCampaign puts the recipient's name and CSV merge fields under
// `contact`, so those are the variables a campaign template can resolve.
const CAMPAIGN_VARIABLES = ["contact.name"];

/** Section heading shared by every group below — matches SectionCard's title weight, a step down in size. */
function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-destructive text-xs" role="alert">
      {message}
    </p>
  );
}

export function CampaignComposer({
  lists,
  timeZone,
}: {
  lists: ContactListOption[];
  /** App-settings timezone, e.g. "America/Toronto" — threaded to AudienceBuilder. */
  timeZone: string;
}) {
  const router = useRouter();
  const editor = useRef<EmailContentEditorHandle>(null);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelKey>("email");
  const [subject, setSubject] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [audience, setAudience] = useState<AudienceValue>({});
  const [attachments, setAttachments] = useState<CampaignAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; subject?: string }>({});

  function validate(): boolean {
    const next: { name?: string; subject?: string } = {};
    if (!name.trim()) next.name = "Name the campaign so you can find it later.";
    if (!subject.trim()) next.subject = channel === "email" ? "Add a subject line." : "Add a title.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await apiFetch<{ publicId: string }>("/api/notifications/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, channels: [channel], audience }),
      });

      const content: Record<string, unknown> = { channel, locale: "en", subject };
      if (channel === "email") {
        const exported = await editor.current?.exportEmail();
        Object.assign(content, {
          body: exported?.body ?? "",
          html: exported?.html ?? "",
          text: exported?.text ?? "",
          attachments: attachments.length > 0 ? attachments : undefined,
        });
      } else {
        Object.assign(content, { body: smsBody, providerTemplateId: templateId || undefined });
      }

      await apiFetch(`/api/notifications/campaigns/${created.publicId}/content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(content),
      });

      toast.success("Campaign saved as a draft");
      router.push(`/dashboard/notifications/campaigns/${created.publicId}`);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <FormSection title="Details" description="Name this campaign and pick where it sends.">
        <div className="space-y-1.5">
          <Label htmlFor="name">Campaign name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="Spring menu"
            aria-invalid={!!errors.name}
            className={cn(errors.name && "border-destructive focus-visible:ring-destructive")}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-2">
          <Label>Channel</Label>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <Button
                key={c.key}
                type="button"
                size="sm"
                variant={channel === c.key ? "default" : "outline"}
                onClick={() => setChannel(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection title="Content" description="What recipients will see.">
        <div className="space-y-1.5">
          <Label htmlFor="subject">{channel === "email" ? "Subject" : "Title"}</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
            }}
            aria-invalid={!!errors.subject}
            className={cn(errors.subject && "border-destructive focus-visible:ring-destructive")}
          />
          <FieldError message={errors.subject} />
        </div>

        {channel === "email" ? (
          <div className="space-y-1.5">
            <Label>Message</Label>
            {/* Campaign copy is free-form, so the only merge vars offered are the
                contact fields the CSV importer lifts. */}
            <EmailContentEditor ref={editor} initialBody="" initialHtml="" variables={CAMPAIGN_VARIABLES} />
            <p className="text-muted-foreground text-xs">
              An unsubscribe link, the sender name and the postal address are appended automatically —
              they are legally required and cannot be removed from the copy.
            </p>
            <CampaignAttachments value={attachments} onChange={setAttachments} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smsBody">Message</Label>
              <Textarea id="smsBody" rows={4} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="templateId">Provider template id</Label>
              <Input id="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
              {/* Outside Meta's 24-hour customer-service window every WhatsApp
                  message must use a template approved in advance, so this field
                  is the content — not the box above. */}
              <p className="text-muted-foreground text-xs">
                WhatsApp messages sent outside the 24-hour reply window must use a template Meta has
                approved in advance. Enter its id here; the text above is the preview.
              </p>
            </div>
          </div>
        )}
      </FormSection>

      <FormSection title="Audience" description="Who receives this campaign.">
        <AudienceBuilder
          lists={lists}
          value={audience}
          onChange={setAudience}
          requiresVerifiedPhone={channel === "sms" || channel === "whatsapp"}
          timeZone={timeZone}
        />
      </FormSection>

      <div className="flex justify-end border-t pt-6">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save draft"}
        </Button>
      </div>
    </div>
  );
}
