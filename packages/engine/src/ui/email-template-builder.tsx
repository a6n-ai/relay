"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { cn } from "@foundry/ui/cn";
import { EmailContentEditor, type EmailContentEditorHandle } from "./email-content-editor";
import type { EmailThemeOverrides } from "./email-editor";
import { SendTestEmailButton } from "./send-test-email-button";
import { readPreheader, withPreheader } from "../preheader";
import type { FooterInfo } from "../template";

export type EmailTemplateBuilderHandle = EmailContentEditorHandle;

/**
 * The one email-building surface: an inbox-style From / Subject / Preview text
 * header, the Visual/HTML/React content editor and "Send test", used everywhere
 * an admin builds an email — event templates, campaign drafts, campaign content
 * edits. A caller owns its own Save/Cancel flow (passed as `actions`, since that
 * differs: templates POST to /templates, campaigns POST to /campaigns/:id/content)
 * but the editing surface and test-send affordance are never re-implemented per screen.
 */
export const EmailTemplateBuilder = forwardRef<
  EmailTemplateBuilderHandle,
  {
    subject: string;
    onSubjectChange: (value: string) => void;
    subjectLabel?: string;
    subjectError?: string;
    initialBody: string;
    initialHtml: string;
    variables: string[];
    onChange?: () => void;
    /** e.g. CampaignAttachments — only campaigns have this, so it's a slot rather than a baked-in field. */
    extra?: ReactNode;
    /** Save/Cancel buttons — caller-specific save flow. Omit when Save lives outside this block. */
    actions?: ReactNode;
    disabled?: boolean;
    /** Stamped onto the live preview only — see EmailContentEditor's `footer` prop. */
    footer?: FooterInfo;
    /** Campaign mail: "Send test" uses the campaign sender and CASL footer. */
    marketing?: boolean;
    /** Display-only sender line, e.g. "TiffinGrab <hello@tiffingrab.ca>". */
    from?: string;
    /** App brand styles for the visual editor — see EmailEditorField. */
    themeOverrides?: EmailThemeOverrides;
  }
>(function EmailTemplateBuilder(
  {
    subject,
    onSubjectChange,
    subjectLabel = "Subject",
    subjectError,
    initialBody,
    initialHtml,
    variables,
    onChange,
    extra,
    actions,
    disabled,
    footer,
    marketing,
    from,
    themeOverrides,
  },
  ref,
) {
  const editorRef = useRef<EmailContentEditorHandle>(null);
  const [previewText, setPreviewText] = useState(() => readPreheader(initialHtml));

  async function exportWithPreheader() {
    if (!editorRef.current) throw new Error("Editor not ready — please wait and try again");
    const out = await editorRef.current.exportEmail();
    const html = withPreheader(out.html, previewText);
    // HTML mode stores the whole document as body too; keep them identical.
    const body = out.body === out.html ? html : out.body;
    return { ...out, html, body };
  }

  useImperativeHandle(ref, () => ({ exportEmail: exportWithPreheader }));

  const row = "grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b px-4 py-2.5 text-sm";
  const field = "w-full bg-transparent outline-none placeholder:text-muted-foreground/60";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="overflow-hidden rounded-xl border bg-card">
          {from && (
            <div className={row}>
              <span className="text-muted-foreground">From</span>
              <span className="truncate">{from}</span>
            </div>
          )}
          <label className={row}>
            <span className="text-muted-foreground">{subjectLabel}</span>
            <input
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              aria-invalid={!!subjectError}
              placeholder="What's this email about?"
              className={field}
            />
          </label>
          <label className={cn(row, "border-b-0")}>
            <span className="text-muted-foreground">Preview text</span>
            <input
              value={previewText}
              onChange={(e) => {
                setPreviewText(e.target.value);
                onChange?.();
              }}
              placeholder="Shown after the subject in the inbox"
              className={field}
            />
          </label>
        </div>
        {subjectError && (
          <p className="text-destructive text-xs" role="alert">
            {subjectError}
          </p>
        )}
      </div>

      <EmailContentEditor
        ref={editorRef}
        initialBody={initialBody}
        initialHtml={initialHtml}
        variables={variables}
        onChange={onChange}
        footer={footer}
        themeOverrides={themeOverrides}
      />

      {extra}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
        <div className="flex flex-wrap items-center gap-2">
          <SendTestEmailButton
            subject={subject}
            disabled={disabled}
            marketing={marketing}
            exportEmail={exportWithPreheader}
          />
        </div>
      </div>
    </div>
  );
});
