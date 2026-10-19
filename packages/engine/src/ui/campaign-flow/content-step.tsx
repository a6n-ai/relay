"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CAMPAIGN_VARIABLE_SAMPLES, CAMPAIGN_VARIABLES } from "../../email-content/variables";
import type { FooterInfo } from "../../template";
import { CampaignAttachments, type CampaignAttachment } from "../campaign-attachments";
import type { CampaignContentRow } from "../campaign-content-section";
import { useAutosave, type SaveState } from "../email-editor/autosave";
import { EmailTemplateBuilder, type EmailTemplateBuilderHandle } from "../email-template-builder";

export interface ContentStepHandle {
  /** Force a save; resolves true when the server has the latest content. */
  save: () => Promise<boolean>;
}

/** Step 1 for an email campaign: the code editor, always open, autosaving while the campaign is a draft. */
export const ContentStep = forwardRef<
  ContentStepHandle,
  {
    campaignPublicId: string;
    content: CampaignContentRow | null;
    autosaveDraft: boolean;
    footer?: FooterInfo;
    from?: string;
    onState: (s: { hasSubject: boolean; hasContent: boolean; save: SaveState }) => void;
  }
>(function ContentStep({ campaignPublicId, content, autosaveDraft, footer, from, onState }, ref) {
  const [subject, setSubject] = useState(content?.subject ?? "");
  const [attachments, setAttachments] = useState<CampaignAttachment[]>(content?.attachments ?? []);
  const [hasContent, setHasContent] = useState(!!content?.html?.trim());
  const editor = useRef<EmailTemplateBuilderHandle>(null);
  const revision = useRef(content?.revision ?? 0);
  const router = useRouter();
  const probe = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(probe.current), []);

  async function persist(): Promise<"ok" | "conflict"> {
    // Never report a save that did not happen.
    if (!editor.current) throw new Error("editor not ready");
    const out = await editor.current.exportEmail();
    setHasContent(!!out.html.trim());
    // The row needs both; until then there is nothing the server would accept.
    if (!subject.trim() || !out.html.trim()) throw new Error("incomplete");
    const res = await fetch(`/api/notifications/campaigns/${campaignPublicId}/content`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "email",
        locale: "en",
        subject,
        body: out.body,
        html: out.html,
        preheader: out.preheader,
        attachments: attachments.length > 0 ? attachments : undefined,
        revision: revision.current,
      }),
    });
    if (res.status === 409) return "conflict";
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // One id: autosave retries the same failure, which would otherwise stack identical toasts.
      toast.error(data.detail ?? data.title ?? "Save failed", { id: `campaign-content-${campaignPublicId}` });
      throw new Error("save failed");
    }
    revision.current = data.revision;
    // Keep the cached page current, so browser Back/Forward never shows an older email or revision.
    router.refresh();
    if (data.removed?.length) toast.warning(`Removed ${data.removed.length} unsafe item(s): ${data.removed.join(", ")}`);
    return "ok";
  }

  // Autosave only once there is something saveable, so an empty draft never shows "Unable to save".
  const saveable = !!subject.trim() && hasContent;
  const autosave = useAutosave({ enabled: autosaveDraft && saveable, save: persist });

  const hasSubject = !!subject.trim();
  useEffect(() => {
    onState({ hasSubject, hasContent, save: autosave.state });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report on change only
  }, [hasSubject, hasContent, autosave.state]);

  useImperativeHandle(ref, () => ({ save: async () => (await autosave.saveNow()) === "ok" }));

  return (
    <EmailTemplateBuilder
      ref={editor}
      subject={subject}
      onSubjectChange={(v) => {
        setSubject(v);
        autosave.markDirty();
      }}
      onChange={() => {
        autosave.markDirty();
        // Ask the editor what it really holds, so clearing it blocks Continue instead of failing a save.
        clearTimeout(probe.current);
        probe.current = setTimeout(() => {
          void editor.current
            ?.exportEmail()
            .then((out) => setHasContent(!!out.html.trim()))
            .catch(() => {});
        }, 300);
      }}
      initialBody={content?.body ?? ""}
      initialHtml={content?.html ?? ""}
      variables={CAMPAIGN_VARIABLES}
      samples={CAMPAIGN_VARIABLE_SAMPLES}
      marketing
      footer={footer}
      from={from}
      extra={
        <details className="rounded-xl border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Attachments ({attachments.length})</summary>
          <div className="pt-3">
            <CampaignAttachments
              value={attachments}
              onChange={(v) => {
                setAttachments(v);
                autosave.markDirty();
              }}
            />
          </div>
        </details>
      }
    />
  );
});
