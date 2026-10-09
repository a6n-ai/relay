"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { cn } from "@foundry/ui/cn";
import { EmailContentEditor, type EmailContentEditorHandle, type EmailMode } from "./email-content-editor";
import { SendTestEmailButton } from "./send-test-email-button";
import { foreignPreheader, readPreheader, withPreheader } from "../preheader";
import { htmlToText } from "../email-content/text";
import type { FooterInfo } from "../template";

export interface EmailTemplateBuilderHandle {
  /** Source + html for the server; the server sanitizes and adds `preheader` (prepareEmailContent). */
  exportEmail: () => Promise<{ format: EmailMode; body: string; html: string; preheader: string }>;
}

/**
 * The one email-building surface: an inbox-style From / Subject / Preview text
 * header, the HTML/React code editor and "Send test", used everywhere
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
    variables: readonly string[];
    /** Preview values for `{{vars}}`. */
    samples?: Record<string, string>;
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
    samples,
  },
  ref,
) {
  const editorRef = useRef<EmailContentEditorHandle>(null);
  const [previewText, setPreviewText] = useState(() => readPreheader(initialHtml));
  // A pasted email may carry its own hidden preview text; we never edit it, so say so.
  const theirPreview = foreignPreheader(initialHtml);

  async function exportForSave() {
    if (!editorRef.current) throw new Error("Editor not ready — please wait and try again");
    const out = await editorRef.current.exportEmail();
    // The server adds the preheader (prepareEmailContent); never bake it in client-side.
    return { ...out, preheader: previewText };
  }

  useImperativeHandle(ref, () => ({ exportEmail: exportForSave }));

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
        {theirPreview && (
          <p className="text-muted-foreground text-xs">
            This email already has its own preview text: “{theirPreview.slice(0, 90)}
            {theirPreview.length > 90 ? "…" : ""}”.{" "}
            {previewText.trim() ? "Yours shows first, then theirs." : "Leave Preview text empty to keep it as is."}
          </p>
        )}
        {subjectError && (
          <p className="text-destructive text-xs" role="alert">
            {subjectError}
          </p>
        )}
      </div>

      <EmailContentEditor
        ref={editorRef}
        // Ours lives in the Preview text field and is re-added by the server on save.
        initialBody={withPreheader(initialBody, "")}
        initialHtml={withPreheader(initialHtml, "")}
        variables={variables}
        onChange={onChange}
        footer={footer}
        samples={samples}
      />

      {extra}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
        <div className="flex flex-wrap items-center gap-2">
          <SendTestEmailButton
            subject={subject}
            disabled={disabled}
            marketing={marketing}
            exportEmail={async () => {
              // The test route takes finished html + text, so mirror the server's preheader pass here.
              const out = await exportForSave();
              const html = withPreheader(out.html, out.preheader);
              return { html, text: htmlToText(html) };
            }}
          />
        </div>
      </div>
    </div>
  );
});
