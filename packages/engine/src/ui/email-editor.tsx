"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { EmailEditor, type EmailEditorRef } from "@react-email/editor";
import { extendTheme } from "@react-email/editor/plugins";
import { Inspector } from "@react-email/editor/ui";
import "@react-email/editor/themes/default.css";
import { LockIcon } from "lucide-react";
import type { FooterInfo } from "../template";
import { uploadEmailImage } from "./upload-email-image";

export type EmailThemeOverrides = Record<string, CSSProperties>;

export interface EmailEditorFieldHandle {
  exportEmail: () => Promise<{ html: string; text: string; body: string }>;
}

interface Props {
  initialHtml: string;
  variables: string[];
  /** Fires on every edit (and once on ready) so the parent can track dirty state. */
  onChange?: () => void;
  /** App brand styles, inlined at export by EmailTheming (keys: body, container, h1, h2, h3, paragraph, link, button, hr, image…). */
  themeOverrides?: EmailThemeOverrides;
  /** Display-only strip under the canvas; the real footer is appended at send. */
  footer?: FooterInfo;
  /** Height classes for the scrolling canvas + inspector area. */
  className?: string;
}

/**
 * Resend-style visual editor: the email is the canvas, `/` inserts blocks
 * (text, headings, lists, button, image, divider, section, columns, table),
 * and the inspector on the right styles whatever is selected.
 */
export const EmailEditorField = forwardRef<EmailEditorFieldHandle, Props>(
  function EmailEditorField(
    { initialHtml, variables, onChange, themeOverrides, footer, className },
    ref,
  ) {
    const editorRef = useRef<EmailEditorRef>(null);
    const [ready, setReady] = useState(false);
    // Overrides arrive as plain CSS maps so apps need no @react-email dependency; cast at this one boundary.
    // ponytail: theme is fixed per mount (EmailEditor re-keys on theme change, which would drop edits).
    const theme = useMemo(
      () =>
        themeOverrides
          ? extendTheme(
              "basic",
              themeOverrides as Parameters<typeof extendTheme>[1],
            )
          : "basic",
      [themeOverrides],
    );

    useImperativeHandle(ref, () => ({
      async exportEmail() {
        const [{ html, text }, body] = await Promise.all([
          editorRef.current!.getEmail(),
          editorRef.current!.getEmailHTML(),
        ]);
        return { html, text, body };
      },
    }));

    const insertVar = (v: string) =>
      editorRef.current?.editor
        ?.chain()
        .focus()
        .insertContent(`{{${v}}}`)
        .run();

    return (
      <div className="flex h-full min-h-0 flex-col">
        {variables.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Insert
            </span>
            {variables.map((v) => (
              <button
                key={v}
                type="button"
                disabled={!ready}
                onClick={() => insertVar(v)}
                className="rounded-md border bg-muted/60 px-2 py-0.5 font-mono text-xs hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {`{{${v}}}`}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">
              · fallback:{" "}
              <code className="font-mono">{`{{${variables[0]}|there}}`}</code>
            </span>
          </div>
        )}
        {/* EmailEditor renders its content area and our children as siblings, so
          a grid places canvas, locked footer and inspector; the area scrolls
          as one and the inspector sticks. */}
        <div
          className={
            "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_18rem] grid-rows-[auto_1fr] overflow-y-auto bg-muted/40 " +
            (className ?? "")
          }
        >
          <EmailEditor
            ref={editorRef}
            content={initialHtml || "<p></p>"}
            theme={theme}
            placeholder="Press '/' for blocks — text, button, image, columns…"
            onUploadImage={uploadEmailImage}
            onReady={() => {
              setReady(true);
              onChange?.();
            }}
            onUpdate={() => onChange?.()}
            className="tg-email-canvas col-start-1 row-start-1 mx-auto mt-6 w-full max-w-[720px] overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_10px_28px_rgba(0,0,0,0.07)] ring-1 ring-black/5"
          >
            {footer && <LockedFooter footer={footer} />}
            <Inspector.Root className="sticky top-0 col-start-2 row-span-2 row-start-1 max-h-full self-start overflow-y-auto border-l bg-card p-4 text-sm">
              <Inspector.Breadcrumb />
              <Inspector.Document />
              <Inspector.Node />
              <Inspector.Text />
            </Inspector.Root>
          </EmailEditor>
        </div>
      </div>
    );
  },
);

function LockedFooter({ footer }: { footer: FooterInfo }) {
  return (
    <div className="col-start-1 row-start-2 mx-auto mb-6 w-full max-w-[720px] self-start px-4 py-4 text-center text-xs text-muted-foreground">
      <p className="mb-1 inline-flex items-center gap-1 font-medium">
        <LockIcon className="size-3" aria-hidden /> Required footer · added at
        send
      </p>
      <p>
        {footer.sender} · {footer.address}
        <br />
        <span className="underline">Unsubscribe</span>
      </p>
    </div>
  );
}
