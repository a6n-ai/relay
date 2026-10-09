"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CircleCheckIcon,
  ExternalLinkIcon,
  MonitorIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { cn } from "@foundry/ui/cn";
import { lintEmailHtml } from "./email-compat";
import { formatCode } from "./format";
import { compileReactEmail, REACT_SOURCE_MARKER } from "./react-template";
import {
  EmailEditorField,
  type EmailEditorFieldHandle,
  type EmailThemeOverrides,
} from "./email-editor";
import { appendUnsubscribeFooter, type FooterInfo } from "../template";

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

/**
 * Open email HTML full-page without giving it the dashboard's origin: a blob
 * URL inherits it, so the email goes into a sandboxed iframe (opaque origin,
 * no scripts) inside a wrapper page that carries no untrusted markup itself.
 */
export function openEmailPreview(html: string) {
  const escaped = html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const page =
    `<!doctype html><meta charset="utf-8"><title>Email preview</title>` +
    `<style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style>` +
    `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${escaped}"></iframe>`;
  const url = URL.createObjectURL(new Blob([page], { type: "text/html" }));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Both panes share one height so the split reads as a single, even surface.
export const EDITOR_PANE_HEIGHT = "h-[72vh] min-h-[560px]";

/** Code pane: wide enough type to read markup, no wrapping, Tab indents instead of leaving the field. */
function CodeArea({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Tab" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey)
          return;
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart: a, selectionEnd: b } = el;
        onChange(el.value.slice(0, a) + "  " + el.value.slice(b));
        requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
      }}
      spellCheck={false}
      wrap="off"
      placeholder={placeholder}
      className={cn(
        EDITOR_PANE_HEIGHT,
        "block w-full resize-none bg-transparent p-4 font-mono text-[13px] leading-6 [tab-size:2] placeholder:text-muted-foreground/70 focus-visible:outline-none",
      )}
    />
  );
}

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
  return out
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which tab an existing email opens on. Visual saves the editor's JSON behind
 * VISUAL_SOURCE_MARKER as body; HTML mode saves the whole document as both body
 * and html (seeded templates do the same, or leave body empty). Opening
 * hand-built HTML in Visual would show TipTap's lossy re-render, so it opens on HTML.
 */
export function initialEmailMode(body: string, html: string): EmailMode {
  if (body.startsWith(REACT_SOURCE_MARKER)) return "react";
  if (!html.trim()) return "visual";
  const b = body.trim();
  return !b || b === html.trim() || /^<(!doctype|html)/i.test(b)
    ? "html"
    : "visual";
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
  /**
   * Stamped onto the live preview ONLY — never into rawHtml/reactHtml/preview
   * state, so it's never exported or saved. Lets an admin see the same CASL
   * footer a recipient gets while still editing the real, footer-less
   * content underneath.
   */
  footer?: FooterInfo;
  /** App brand styles for the visual editor — see EmailEditorField. */
  themeOverrides?: EmailThemeOverrides;
}

/**
 * The one email-content engine every email — event template or campaign —
 * edits through: visual (TipTap), raw HTML, or a react-email source, each
 * exporting to the same {html, text, body} shape via exportEmail(). Same
 * contract as the bare EmailEditorField, so a caller that only used the
 * visual editor before can swap in this component with no other changes.
 */
export const EmailContentEditor = forwardRef<EmailContentEditorHandle, Props>(
  function EmailContentEditor(
    { initialBody, initialHtml, variables, onChange, footer, themeOverrides },
    ref,
  ) {
    const isReact = initialBody.startsWith(REACT_SOURCE_MARKER);
    const [mode, setMode] = useState<EmailMode>(() =>
      initialEmailMode(initialBody, initialHtml),
    );
    const [rawHtml, setRawHtml] = useState(isReact ? "" : initialHtml);
    const [reactSource, setReactSource] = useState(
      isReact ? initialBody.slice(REACT_SOURCE_MARKER.length) : "",
    );
    const [reactHtml, setReactHtml] = useState(isReact ? initialHtml : "");
    const [reactError, setReactError] = useState("");
    const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
    const [visualOpened, setVisualOpened] = useState(mode === "visual");
    const emailRef = useRef<EmailEditorFieldHandle>(null);

    // Which mode was actually last TYPED in, as opposed to merely viewed.
    // Visual (TipTap) is lossy for markup it doesn't understand — tables,
    // inline styles, an Outlook/Word export, a hand-built footer — so just
    // clicking the Visual tab to look, then hitting Save while it's active,
    // must not silently export TipTap's re-serialized (and possibly mangled)
    // doc over content nobody touched. TipTap's onUpdate only fires on a real
    // edit (not on the initial mount), so this stays null — meaning "trust
    // the mode implied by the stored content" — until the admin actually
    // types somewhere.
    const [editedMode, setEditedMode] = useState<EmailMode | null>(null);
    const exportMode = editedMode ?? mode;

    const compatWarnings = useMemo(
      () => (mode === "html" ? lintEmailHtml(rawHtml) : []),
      [mode, rawHtml],
    );

    function withFooter(html: string): string {
      if (!footer || !html) return html;
      return appendUnsubscribeFooter({ html, text: "" }, footer, {
        preview: true,
      }).html;
    }

    function markVisualEdited() {
      setEditedMode("visual");
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
        if (exportMode === "react") {
          const html = await compileReactEmail(reactSource);
          return {
            html,
            text: htmlToText(html),
            body: REACT_SOURCE_MARKER + reactSource,
          };
        }
        if (exportMode === "html") {
          return { html: rawHtml, text: htmlToText(rawHtml), body: rawHtml };
        }
        if (!emailRef.current)
          throw new Error("Editor not ready — please wait and try again");
        return emailRef.current.exportEmail();
      },
    }));

    async function format() {
      try {
        if (mode === "html") {
          setRawHtml(await formatCode(rawHtml, "html"));
          setEditedMode("html");
        } else if (mode === "react") {
          setReactSource(await formatCode(reactSource, "react"));
          setEditedMode("react");
        }
      } catch (e) {
        toast.error(
          `Format failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const previewHtml = withFooter(mode === "html" ? rawHtml : reactHtml);

    const openFull = () => openEmailPreview(previewHtml);

    const paneHeader =
      "flex h-12 items-center justify-between gap-2 border-b px-3";

    const modeTabs = (
      <Tabs
        value={mode}
        onValueChange={(v) => {
          if (v === "visual") setVisualOpened(true);
          setMode(v as EmailMode);
        }}
      >
        <TabsList>
          <TabsTrigger value="visual">Visual</TabsTrigger>
          <TabsTrigger value="html">HTML</TabsTrigger>
          <TabsTrigger value="react">React</TabsTrigger>
        </TabsList>
      </Tabs>
    );

    async function previewVisual() {
      const out = await emailRef.current?.exportEmail();
      if (out) openEmailPreview(withFooter(out.html));
    }

    // Visual is the email itself — canvas + inspector. Once opened it stays
    // mounted (hidden) so a trip to HTML/React and back keeps unsaved edits.
    const visualPane = visualOpened && (
        <div className={cn("overflow-hidden rounded-xl border bg-card", mode !== "visual" && "hidden")}>
          <div className={paneHeader}>
            {modeTabs}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Type{" "}
                <kbd className="rounded border bg-muted px-1 font-mono">/</kbd>{" "}
                for blocks · click anything to style it
              </span>
              <Button type="button" variant="outline" size="sm" onClick={previewVisual}>
                <ExternalLinkIcon className="size-3.5" /> Preview
              </Button>
            </div>
          </div>
          <div className={EDITOR_PANE_HEIGHT}>
            <EmailEditorField
              ref={emailRef}
              initialHtml={isReact ? "" : initialBody}
              variables={variables}
              onChange={markVisualEdited}
              themeOverrides={themeOverrides}
              footer={footer}
            />
          </div>
        </div>
    );

    if (mode === "visual") return visualPane;

    return (
      <>
      {visualPane}
      <div className="grid overflow-hidden rounded-xl border bg-card lg:grid-cols-2 lg:divide-x">
        {/* Source */}
        <section aria-label="Email source" className="flex min-w-0 flex-col">
          <div className={paneHeader}>
            {modeTabs}
            <div className="flex items-center gap-2">
              {mode === "react" && !reactSource.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReactSource(REACT_STARTER)}
                >
                  Insert starter
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={format}
              >
                Format
              </Button>
            </div>
          </div>

          <div className="bg-muted/20">
            {mode === "html" ? (
              <CodeArea
                label="Email HTML"
                value={rawHtml}
                onChange={(v) => {
                  setRawHtml(v);
                  setEditedMode("html");
                  onChange?.();
                }}
                placeholder="<!DOCTYPE html> … paste rich email HTML here"
              />
            ) : (
              <CodeArea
                label="React email source"
                value={reactSource}
                onChange={(v) => {
                  setReactSource(v);
                  setEditedMode("react");
                  onChange?.();
                }}
                placeholder={REACT_STARTER}
              />
            )}
          </div>

          <div className="space-y-2 border-t px-3 py-2.5 text-xs text-muted-foreground">
              <p>
                {mode === "react" ? (
                  <>
                    <code className="font-mono">export default</code> a
                    react-email component — Html, Body, Container, Heading,
                    Text, Button… are in scope, no imports.{" "}
                  </>
                ) : null}
                {variables.length > 0 && (
                  <>
                    Variables:{" "}
                    <code className="font-mono">{`{{${variables[0]}}}`}</code>
                    {variables.length > 1
                      ? ` +${variables.length - 1} more`
                      : ""}{" "}
                    — empty when missing.
                  </>
                )}
              </p>
              {mode === "html" && compatWarnings.length > 0 && (
                <details className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-warn">
                    <TriangleAlertIcon className="size-3.5" />
                    Email client compatibility ({compatWarnings.length})
                  </summary>
                  <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                    {compatWarnings.map((w, i) => (
                      <li key={`${w.line}-${w.property}-${i}`}>
                        <span className="font-mono">L{w.line}</span> ·{" "}
                        <strong>{w.property}</strong> — not supported in{" "}
                        {w.clients}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {mode === "react" && reactError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2"
                >
                  <p className="flex items-center gap-1.5 font-medium text-destructive">
                    <TriangleAlertIcon className="size-3.5" /> Compile error
                  </p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-destructive">
                    {reactError}
                  </pre>
                </div>
              )}
            </div>
        </section>

        {/* Preview */}
        <section
          aria-label="Email preview"
          className="flex min-w-0 flex-col border-t lg:border-t-0"
        >
          <div className={paneHeader}>
            <Tabs
              value={device}
              onValueChange={(v) => setDevice(v as "desktop" | "mobile")}
            >
              <TabsList>
                <TabsTrigger value="desktop" aria-label="Desktop width">
                  <MonitorIcon className="size-3.5" /> Desktop
                </TabsTrigger>
                <TabsTrigger value="mobile" aria-label="Mobile width">
                  <SmartphoneIcon className="size-3.5" /> Mobile
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openFull}
              disabled={!previewHtml}
            >
              <ExternalLinkIcon className="size-3.5" /> Open
            </Button>
          </div>
          <div
            className={cn(
              EDITOR_PANE_HEIGHT,
              "flex justify-center overflow-hidden bg-muted/40 p-4",
            )}
          >
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              sandbox=""
              className={cn(
                "h-full rounded-lg bg-white shadow-sm ring-1 ring-black/5 transition-[width] duration-200 ease-out motion-reduce:transition-none",
                device === "mobile" ? "w-[375px] max-w-full" : "w-full",
              )}
            />
          </div>
          <p className="flex items-center gap-1.5 border-t px-3 py-2.5 text-xs text-muted-foreground">
            {footer ? (
              <>
                <CircleCheckIcon className="size-3.5 text-success" />
                Sender, postal address and unsubscribe link are added at send
                (highlighted in preview).
              </>
            ) : (
              <>
                <TriangleAlertIcon className="size-3.5 text-warn" />
                No unsubscribe footer configured — marketing sends will go out
                without one.
              </>
            )}
          </p>
        </section>
      </div>
      </>
    );
  },
);
