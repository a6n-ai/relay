"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { apiFetch } from "./api-fetch";
import { CampaignAttachments, type CampaignAttachment } from "./campaign-attachments";
import { EmailTemplateBuilder, type EmailTemplateBuilderHandle } from "./email-template-builder";
import { openEmailPreview } from "./email-content-editor";
import type { FooterInfo } from "../template";
import { CAMPAIGN_VARIABLE_SAMPLES, CAMPAIGN_VARIABLES } from "../email-content/variables";
import { useAutosave } from "./email-editor/autosave";
import { SaveStatus } from "./email-editor/save-status";

export interface CampaignContentRow {
  channel: string;
  locale: string;
  subject: string;
  body: string | null;
  html: string | null;
  text: string | null;
  providerTemplateId: string | null;
  attachments?: CampaignAttachment[];
  /** Footer-stamped copy for read-only preview — falls back to `html` when absent. */
  previewHtml?: string | null;
  /** Optimistic-concurrency revision; a save carrying a stale one gets 409. Required so a page can't forget it. */
  revision: number;
}

function EmailPreview({ html }: { html: string }) {
  // Same HTML already in hand, so opening it full-page needs no round trip.
  const openFull = () => openEmailPreview(html);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={openFull}>
          <ExternalLinkIcon className="size-3.5" /> Open
        </Button>
      </div>
      {/* srcDoc sandboxes the campaign's own HTML/CSS from the dashboard's — a
          recipient-facing email is untrusted markup as far as the admin UI is
          concerned, same as previewing anyone else's HTML. */}
      <iframe
        title="Email preview"
        srcDoc={html}
        sandbox=""
        className="h-[60vh] min-h-[420px] w-full resize-y overflow-auto rounded-lg border bg-white"
      />
    </div>
  );
}

function EmailRow({
  campaignPublicId,
  row,
  editable,
  footer,
  from,
  autosaveDraft = false,
}: {
  campaignPublicId: string;
  row: CampaignContentRow;
  editable: boolean;
  footer?: FooterInfo;
  /** Display-only sender line on the email header. */
  from?: string;
  /** Only a plain draft autosaves; scheduled and system campaigns are live, so explicit Save only. */
  autosaveDraft?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(row.subject);
  const [attachments, setAttachments] = useState<CampaignAttachment[]>(row.attachments ?? []);
  const editor = useRef<EmailTemplateBuilderHandle>(null);
  const revision = useRef(row.revision ?? 0);

  async function persist(): Promise<"ok" | "conflict"> {
    if (!subject.trim()) {
      toast.error("Add a subject");
      throw new Error("subject required");
    }
    if (!editor.current) return "ok"; // editor closed; nothing left to save
    const exported = await editor.current.exportEmail();
    const res = await fetch(`/api/notifications/campaigns/${campaignPublicId}/content`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: row.channel,
        locale: row.locale,
        subject,
        body: exported.body,
        html: exported.html,
        preheader: exported.preheader,
        attachments: attachments.length > 0 ? attachments : undefined,
        revision: revision.current,
      }),
    });
    if (res.status === 409) return "conflict";
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.detail ?? data.title ?? "Save failed");
      throw new Error("save failed");
    }
    revision.current = data.revision;
    autosaved.current = true;
    if (data.removed?.length) toast.warning(`Removed ${data.removed.length} unsafe item(s): ${data.removed.join(", ")}`);
    return "ok";
  }
  const autosave = useAutosave({ enabled: editing && autosaveDraft, save: persist });
  const autosaved = useRef(false);
  const saving = autosave.state.status === "saving";

  async function save() {
    const outcome = await autosave.saveNow();
    if (outcome !== "ok") return;
    toast.success("Content saved");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="bg-card space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{row.channel}</Badge>
          <span className="text-muted-foreground font-mono text-xs uppercase tracking-wide">{row.locale}</span>
        </div>
        {editable && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <EmailTemplateBuilder
          ref={editor}
          subject={subject}
          onSubjectChange={(v) => {
            setSubject(v);
            autosave.markDirty();
          }}
          onChange={autosave.markDirty}
          initialBody={row.body ?? ""}
          initialHtml={row.html ?? ""}
          variables={CAMPAIGN_VARIABLES}
          samples={CAMPAIGN_VARIABLE_SAMPLES}
          marketing
          disabled={saving}
          footer={footer} from={from}
          extra={<CampaignAttachments value={attachments} onChange={setAttachments} />}
          actions={
            <div className="ml-auto flex items-center gap-2">
              <SaveStatus state={autosave.state} onRetry={() => void autosave.saveNow()} onReload={() => location.reload()} />
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => {
                  autosave.cancel();
                  setEditing(false);
                  setSubject(row.subject);
                  // Autosaved work is already stored; reload the row so reopening shows it, not the old copy.
                  if (autosaved.current) router.refresh();
                }}
              >
                {autosaveDraft ? "Close" : "Cancel"}
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium">{row.subject}</p>
          {row.html ? (
            <EmailPreview html={row.previewHtml ?? row.html} />
          ) : (
            <p className="text-muted-foreground text-sm">No content yet.</p>
          )}
          {row.attachments && row.attachments.length > 0 && (
            <p className="text-muted-foreground text-xs">
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
          revision: row.revision,
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
    <div className="bg-card space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{row.channel}</Badge>
          <span className="text-muted-foreground font-mono text-xs uppercase tracking-wide">{row.locale}</span>
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
  footer,
  from,
  autosaveDraft = false,
}: {
  campaignPublicId: string;
  content: CampaignContentRow[];
  editable: boolean;
  /** Stamped onto each email row's live preview while editing — see EmailContentEditor's `footer` prop. */
  footer?: FooterInfo;
  /** Display-only sender line on the email header. */
  from?: string;
  /** True only for a plain draft: scheduled and system campaigns are live, so explicit Save only. */
  autosaveDraft?: boolean;
}) {
  if (content.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No content yet — a campaign with no content for a channel does not send on it.
      </p>
    );
  }
  const hasEmail = content.some((c) => c.channel === "email");
  return (
    <div className="space-y-4">
      {hasEmail && !footer && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          <span>
            Sender/unsubscribe config missing (UNSUBSCRIBE_SECRET, CAMPAIGN_POSTAL_ADDRESS, CAMPAIGN_BASE_URL) —
            no CASL footer will be added to this email, in preview or at send time.
          </span>
        </div>
      )}
      {content.map((c) =>
        c.channel === "email" ? (
          <EmailRow key={`${c.channel}-${c.locale}`} campaignPublicId={campaignPublicId} row={c} editable={editable} footer={footer} from={from} autosaveDraft={autosaveDraft} />
        ) : (
          <TextRow key={`${c.channel}-${c.locale}`} campaignPublicId={campaignPublicId} row={c} editable={editable} />
        ),
      )}
    </div>
  );
}
