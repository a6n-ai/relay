"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { apiFetch } from "./api-fetch";
import { CampaignAttachments, type CampaignAttachment } from "./campaign-attachments";
import { EmailContentEditor, type EmailContentEditorHandle } from "./email-content-editor";

export interface CampaignContentRow {
  channel: string;
  locale: string;
  subject: string;
  body: string | null;
  html: string | null;
  text: string | null;
  providerTemplateId: string | null;
  attachments?: CampaignAttachment[];
}

const CAMPAIGN_VARIABLES = ["contact.name"];

function EmailPreview({ html }: { html: string }) {
  // srcDoc sandboxes the campaign's own HTML/CSS from the dashboard's — a
  // recipient-facing email is untrusted markup as far as the admin UI is
  // concerned, same as previewing anyone else's HTML.
  return (
    <iframe
      title="Email preview"
      srcDoc={html}
      sandbox=""
      className="h-[420px] w-full rounded-lg border bg-white"
    />
  );
}

function EmailRow({
  campaignPublicId,
  row,
  editable,
}: {
  campaignPublicId: string;
  row: CampaignContentRow;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(row.subject);
  const [attachments, setAttachments] = useState<CampaignAttachment[]>(row.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const editor = useRef<EmailContentEditorHandle>(null);

  async function save() {
    if (!subject.trim()) return toast.error("Add a subject");
    setSaving(true);
    try {
      const exported = await editor.current?.exportEmail();
      await apiFetch(`/api/notifications/campaigns/${campaignPublicId}/content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: row.channel,
          locale: row.locale,
          subject,
          body: exported?.body ?? "",
          html: exported?.html ?? "",
          text: exported?.text ?? "",
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });
      toast.success("Content saved");
      setEditing(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{row.channel}</Badge>
          <span className="text-muted-foreground">{row.locale}</span>
        </div>
        {editable && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <EmailContentEditor
              ref={editor}
              initialBody={row.body ?? ""}
              initialHtml={row.html ?? ""}
              variables={CAMPAIGN_VARIABLES}
            />
          </div>
          <CampaignAttachments value={attachments} onChange={setAttachments} />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setSubject(row.subject);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">{row.subject}</p>
          {row.html ? (
            <EmailPreview html={row.html} />
          ) : (
            <p className="text-sm text-muted-foreground">No content yet.</p>
          )}
          {row.attachments && row.attachments.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {row.attachments.length} attachment{row.attachments.length === 1 ? "" : "s"}:{" "}
              {row.attachments.map((a) => a.filename).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TextRow({
  campaignPublicId,
  row,
  editable,
}: {
  campaignPublicId: string;
  row: CampaignContentRow;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(row.body ?? "");
  const [templateId, setTemplateId] = useState(row.providerTemplateId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/notifications/campaigns/${campaignPublicId}/content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: row.channel,
          locale: row.locale,
          subject: row.subject,
          body,
          providerTemplateId: templateId || undefined,
        }),
      });
      toast.success("Content saved");
      setEditing(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{row.channel}</Badge>
          <span className="text-muted-foreground">{row.locale}</span>
        </div>
        {editable && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5" /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="space-y-1.5">
            <Label>Provider template id</Label>
            <Input value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{row.body || "No content yet."}</p>
      )}
    </div>
  );
}

/** One card per channel/locale. Editable only while the campaign is still draft/scheduled. */
export function CampaignContentSection({
  campaignPublicId,
  content,
  editable,
}: {
  campaignPublicId: string;
  content: CampaignContentRow[];
  editable: boolean;
}) {
  if (content.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No content yet — a campaign with no content for a channel does not send on it.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {content.map((c) =>
        c.channel === "email" ? (
          <EmailRow key={`${c.channel}-${c.locale}`} campaignPublicId={campaignPublicId} row={c} editable={editable} />
        ) : (
          <TextRow key={`${c.channel}-${c.locale}`} campaignPublicId={campaignPublicId} row={c} editable={editable} />
        ),
      )}
    </div>
  );
}
