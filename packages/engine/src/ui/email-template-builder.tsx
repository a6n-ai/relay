"use client";

import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { EmailContentEditor, type EmailContentEditorHandle } from "./email-content-editor";
import { SendTestEmailButton } from "./send-test-email-button";
import type { FooterInfo } from "../template";

export type EmailTemplateBuilderHandle = EmailContentEditorHandle;

/**
 * The one email-building surface: subject + the Visual/HTML/React content
 * editor + "Send test", used everywhere an admin builds an email — event
 * templates, campaign drafts, campaign content edits. A caller owns its own
 * Save/Cancel flow (passed as `actions`, since that differs: templates POST
 * to /templates, campaigns POST to /campaigns/:id/content) but the editing
 * surface and test-send affordance are never re-implemented per screen.
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
  }
>(function EmailTemplateBuilder(
  { subject, onSubjectChange, subjectLabel = "Subject", subjectError, initialBody, initialHtml, variables, onChange, extra, actions, disabled, footer },
  ref,
) {
  const editorRef = useRef<EmailContentEditorHandle>(null);
  useImperativeHandle(ref, () => ({
    exportEmail: () => {
      if (!editorRef.current) throw new Error("Editor not ready — please wait and try again");
      return editorRef.current.exportEmail();
    },
  }));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>{subjectLabel}</Label>
        <Input value={subject} onChange={(e) => onSubjectChange(e.target.value)} aria-invalid={!!subjectError} />
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
      />

      {extra}

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <SendTestEmailButton
          subject={subject}
          disabled={disabled}
          exportEmail={async () => {
            if (!editorRef.current) throw new Error("Editor not ready — please wait and try again");
            return editorRef.current.exportEmail();
          }}
        />
      </div>
    </div>
  );
});
