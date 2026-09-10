"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { lintEmailHtml } from "./email-compat";
import { formatCode } from "./format";
import { compileReactEmail, REACT_SOURCE_MARKER } from "./react-template";
import { EmailEditorField, type EmailEditorFieldHandle } from "./email-editor";

type EmailMode = "visual" | "html" | "react";

const REACT_STARTER = `export default function Email() {
  return (
    <Html>
      <Body style={{ fontFamily: "Inter, Arial, sans-serif", backgroundColor: "#faf6f0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
          <Heading>Thanks, {"{{order.customerName}}"} 👋</Heading>
          <Text>Order {"{{order.code}}"} received — we're on it.</Text>
          <Button href="https://tiffingrab.example/orders/{{order.code}}">View order</Button>
        </Container>
      </Body>
    </Html>
  );
}`;

// ponytail: naive tag-strip for the plaintext fallback. Good enough for a text
// part; upgrade to a real html-to-text pass if deliverability complains.
function htmlToText(html: string): string {
  let s = html;
  for (;;) {
    const lower = s.toLowerCase();
    const start = lower.indexOf("<style");
    if (start < 0) break;
    const end = lower.indexOf("</style>", start);
    if (end < 0) {
      s = s.slice(0, start);
      break;
    }
    s = s.slice(0, start) + s.slice(end + 8);
  }
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "<") {
      const close = s.indexOf(">", i + 1);
      if (close < 0) break;
      out += " ";
      i = close + 1;
      continue;
    }
    out += s[i];
    i += 1;
  }
  return out.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

export interface EmailContentEditorHandle {
  exportEmail: () => Promise<{ html: string; text: string; body: string }>;
}

interface Props {
  /** Stored body — react-authored content carries the REACT_SOURCE_MARKER prefix. */
  initialBody: string;
  initialHtml: string;
  variables: string[];
  /** Fires on every edit (any mode) so a parent tracking dirty state can react. */
  onChange?: () => void;
}

/**
 * The one email-content engine every email — event template or campaign —
 * edits through: visual (TipTap), raw HTML, or a react-email source, each
 * exporting to the same {html, text, body} shape via exportEmail(). Same
 * contract as the bare EmailEditorField, so a caller that only used the
 * visual editor before can swap in this component with no other changes.
 */
export const EmailContentEditor = forwardRef<EmailContentEditorHandle, Props>(
  function EmailContentEditor({ initialBody, initialHtml, variables, onChange }, ref) {
    const isReact = initialBody.startsWith(REACT_SOURCE_MARKER);
    const [mode, setMode] = useState<EmailMode>(isReact ? "react" : "visual");
    const [rawHtml, setRawHtml] = useState(isReact ? "" : initialHtml);
    const [reactSource, setReactSource] = useState(isReact ? initialBody.slice(REACT_SOURCE_MARKER.length) : "");
    const [reactHtml, setReactHtml] = useState(isReact ? initialHtml : "");
    const [reactError, setReactError] = useState("");
    const [preview, setPreview] = useState("");
    const emailRef = useRef<EmailEditorFieldHandle>(null);
    const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const compatWarnings = useMemo(() => (mode === "html" ? lintEmailHtml(rawHtml) : []), [mode, rawHtml]);

    function refreshVisualPreview() {
      clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(async () => {
        const out = await emailRef.current?.exportEmail();
        if (out) setPreview(out.body);
      }, 250);
      onChange?.();
    }

    // Debounced client-side React compile — transpile + render in this browser.
    useEffect(() => {
      if (mode !== "react") return;
      if (!reactSource.trim()) {
        setReactHtml("");
        setReactError("");
        return;
      }
      const id = setTimeout(async () => {
        try {
          setReactHtml(await compileReactEmail(reactSource));
          setReactError("");
        } catch (e) {
          setReactError(e instanceof Error ? e.message : String(e));
        }
      }, 350);
      return () => clearTimeout(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on source edits only
    }, [mode, reactSource]);

    useImperativeHandle(ref, () => ({
      async exportEmail() {
        if (mode === "react") {
          const html = await compileReactEmail(reactSource);
          return { html, text: htmlToText(html), body: REACT_SOURCE_MARKER + reactSource };
        }
        if (mode === "html") {
          return { html: rawHtml, text: htmlToText(rawHtml), body: rawHtml };
        }
        if (!emailRef.current) throw new Error("Editor not ready — please wait and try again");
        return emailRef.current.exportEmail();
      },
    }));

    async function format() {
      try {
        if (mode === "html") setRawHtml(await formatCode(rawHtml, "html"));
        else if (mode === "react") setReactSource(await formatCode(reactSource, "react"));
      } catch (e) {
        toast.error(`Format failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Tabs value={mode} onValueChange={(v) => setMode(v as EmailMode)}>
              <TabsList>
                <TabsTrigger value="visual">Visual</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="react">React</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode !== "visual" && (
              <div className="flex items-center gap-3">
                {variables.length > 0 && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Use {`{{var}}`} tokens, e.g. <code className="font-mono">{`{{${variables[0]}}}`}</code>
                  </span>
                )}
                <Button type="button" variant="outline" size="sm" onClick={format}>
                  Format
                </Button>
              </div>
            )}
          </div>

          {mode === "visual" ? (
            <EmailEditorField
              ref={emailRef}
              initialHtml={isReact ? "" : initialBody}
              variables={variables}
              onChange={refreshVisualPreview}
            />
          ) : mode === "html" ? (
            <>
              <textarea
                value={rawHtml}
                onChange={(e) => {
                  setRawHtml(e.target.value);
                  onChange?.();
                }}
                spellCheck={false}
                placeholder="<!DOCTYPE html> … paste rich email HTML here"
                className="h-[600px] w-full resize-y rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {compatWarnings.length > 0 && (
                <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
                  <p className="mb-1.5 flex items-center gap-1.5 font-medium text-warn">
                    <TriangleAlertIcon className="size-3.5" />
                    Email client compatibility ({compatWarnings.length})
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {compatWarnings.map((w, i) => (
                      <li key={`${w.line}-${w.property}-${i}`}>
                        <span className="font-mono">L{w.line}</span> · <strong>{w.property}</strong> — not
                        supported in {w.clients}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <textarea
                value={reactSource}
                onChange={(e) => {
                  setReactSource(e.target.value);
                  onChange?.();
                }}
                spellCheck={false}
                placeholder={REACT_STARTER}
                className="h-[600px] w-full resize-y rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  <code className="font-mono">export default</code> a react-email component. Components
                  (Html, Body, Container, Heading, Text, Button…) are in scope — no imports needed.
                </span>
                {!reactSource.trim() && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setReactSource(REACT_STARTER)}>
                    Insert starter
                  </Button>
                )}
              </div>
              {reactError && (
                <div className="rounded-lg border border-red-300/60 bg-red-50 p-3 text-xs dark:border-red-500/30 dark:bg-red-950/30">
                  <p className="flex items-center gap-1.5 font-medium text-red-900 dark:text-red-200">
                    <TriangleAlertIcon className="size-3.5" /> Compile error
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-red-800 dark:text-red-300">{reactError}</pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="h-fit space-y-2 lg:sticky lg:top-4">
          <p className="text-xs font-medium text-muted-foreground">Live preview</p>
          <iframe
            title="Email preview"
            srcDoc={mode === "html" ? rawHtml : mode === "react" ? reactHtml : preview}
            className="h-[600px] w-full rounded-lg border bg-white"
          />
        </div>
      </div>
    );
  },
);
