"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { CircleCheckIcon, ExternalLinkIcon, MonitorIcon, SmartphoneIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { appendUnsubscribeFooter, type FooterInfo } from "../template";
import { CodePane } from "./email-editor/code-pane";
import { createReactCompiler } from "./email-editor/react-compiler";
import { fillSamples } from "./email-editor/samples";
import { formatCode } from "./format";
import { REACT_SOURCE_MARKER } from "./react-template";

export type EmailMode = "html" | "react";

const REACT_STARTER = `export default function Email() {
  return (
    <Html>
      <Body style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#ffffff" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
          <Heading>Hi {"{{contact.first_name|there}}"}</Heading>
          <Text>Write your message here.</Text>
          <Button href="https://example.com">Call to action</Button>
        </Container>
      </Body>
    </Html>
  );
}`;

export const EDITOR_PANE_HEIGHT = "h-[72vh] min-h-[560px]";

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

/**
 * Which tab an existing email opens on: React for react-authored source,
 * otherwise HTML showing the stored html — including rows saved by the old
 * Visual editor, whose html is the composed email.
 */
export function initialEmailMode(body: string, _html: string): EmailMode {
  return body.startsWith(REACT_SOURCE_MARKER) ? "react" : "html";
}

export interface EmailContentEditorHandle {
  exportEmail: () => Promise<{ format: EmailMode; body: string; html: string }>;
}

interface Props {
  initialBody: string;
  initialHtml: string;
  variables: readonly string[];
  /** Preview values for `{{vars}}`; keys match `variables`. */
  samples?: Record<string, string>;
  /** Fires on every edit so a parent can track dirty state / autosave. */
  onChange?: () => void;
  /** Stamped onto the preview only, never saved; the real footer is added at send. */
  footer?: FooterInfo;
}

/** The one email editor for campaigns and event templates: HTML or React source + a sandboxed live preview. */
export const EmailContentEditor = forwardRef<EmailContentEditorHandle, Props>(function EmailContentEditor(
  { initialBody, initialHtml, variables, samples, onChange, footer },
  ref,
) {
  const isReact = initialBody.startsWith(REACT_SOURCE_MARKER);
  const [mode, setMode] = useState<EmailMode>(() => initialEmailMode(initialBody, initialHtml));
  const [rawHtml, setRawHtml] = useState(isReact ? "" : initialHtml);
  const [reactSource, setReactSource] = useState(isReact ? initialBody.slice(REACT_SOURCE_MARKER.length) : "");
  const [reactHtml, setReactHtml] = useState(isReact ? initialHtml : "");
  const [reactError, setReactError] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [sampleMode, setSampleMode] = useState<"sample" | "long" | "missing">("sample");
  const compiler = useMemo(() => createReactCompiler(), []);
  useEffect(() => () => compiler.dispose(), [compiler]);

  // Debounced compile in the worker; the preview keeps the last good render on error.
  useEffect(() => {
    if (mode !== "react") return;
    if (!reactSource.trim()) {
      setReactHtml("");
      setReactError("");
      return;
    }
    const id = setTimeout(() => {
      compiler.compile(reactSource).then(
        (html) => {
          setReactHtml(html);
          setReactError("");
        },
        (e: unknown) => setReactError(e instanceof Error ? e.message : String(e)),
      );
    }, 350);
    return () => clearTimeout(id);
  }, [mode, reactSource, compiler]);

  useImperativeHandle(ref, () => ({
    async exportEmail() {
      if (mode === "react") {
        const html = await compiler.compile(reactSource);
        return { format: "react" as const, body: REACT_SOURCE_MARKER + reactSource, html };
      }
      return { format: "html" as const, body: rawHtml, html: rawHtml };
    },
  }));

  async function format() {
    try {
      if (mode === "html") setRawHtml(await formatCode(rawHtml, "html"));
      else setReactSource(await formatCode(reactSource, "react"));
      onChange?.();
    } catch (e) {
      toast.error(`Format failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const sourceHtml = mode === "html" ? rawHtml : reactHtml;
  const previewHtml = useMemo(() => {
    if (!sourceHtml) return "";
    const withFooter = footer
      ? appendUnsubscribeFooter({ html: sourceHtml, text: "" }, footer, { preview: true }).html
      : sourceHtml;
    return fillSamples(withFooter, samples ?? {}, sampleMode);
  }, [sourceHtml, footer, samples, sampleMode]);

  const paneHeader = "flex h-12 items-center justify-between gap-2 border-b px-3";
  const empty = mode === "html" ? !rawHtml.trim() : !reactSource.trim();

  return (
    <div className="grid overflow-hidden rounded-xl border bg-card lg:grid-cols-2 lg:divide-x">
      <section aria-label="Email source" className="flex min-w-0 flex-col">
        <div className={paneHeader}>
          <Tabs value={mode} onValueChange={(v) => setMode(v as EmailMode)}>
            <TabsList>
              <TabsTrigger value="html">HTML</TabsTrigger>
              <TabsTrigger value="react">React</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            {mode === "react" && !reactSource.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReactSource(REACT_STARTER);
                  onChange?.();
                }}
              >
                Insert starter
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={format} disabled={empty}>
              Format
            </Button>
          </div>
        </div>
        <div className={cn(EDITOR_PANE_HEIGHT, "relative bg-muted/20")}>
          {empty && (
            <p className="pointer-events-none absolute inset-x-0 top-16 z-10 px-6 text-center text-sm text-muted-foreground">
              Paste the {mode === "html" ? "HTML" : "React"} email from your AI tool, or start typing. Type{" "}
              <code className="font-mono">{"{{"}</code> for variables.
            </p>
          )}
          <CodePane
            label={mode === "html" ? "Email HTML" : "React email source"}
            language={mode === "html" ? "html" : "tsx"}
            value={mode === "html" ? rawHtml : reactSource}
            variables={variables}
            onChange={(v) => {
              if (mode === "html") setRawHtml(v);
              else setReactSource(v);
              onChange?.();
            }}
          />
        </div>
        {mode === "react" && reactError && (
          <div role="alert" className="border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <p className="flex items-center gap-1.5 font-medium">
              <TriangleAlertIcon className="size-3.5" /> Couldn&apos;t render
            </p>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{reactError}</pre>
          </div>
        )}
      </section>

      <section aria-label="Email preview" className="flex min-w-0 flex-col border-t lg:border-t-0">
        <div className={paneHeader}>
          <Tabs value={device} onValueChange={(v) => setDevice(v as "desktop" | "mobile")}>
            <TabsList>
              <TabsTrigger value="desktop" aria-label="Desktop width">
                <MonitorIcon className="size-3.5" /> Desktop
              </TabsTrigger>
              <TabsTrigger value="mobile" aria-label="Mobile width">
                <SmartphoneIcon className="size-3.5" /> Mobile
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Tabs value={sampleMode} onValueChange={(v) => setSampleMode(v as typeof sampleMode)}>
              <TabsList aria-label="Preview data">
                <TabsTrigger value="sample">Sample</TabsTrigger>
                <TabsTrigger value="long">Long</TabsTrigger>
                <TabsTrigger value="missing">Missing</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button type="button" variant="ghost" size="sm" onClick={() => openEmailPreview(previewHtml)} disabled={!previewHtml}>
              <ExternalLinkIcon className="size-3.5" /> Open
            </Button>
          </div>
        </div>
        <div className={cn(EDITOR_PANE_HEIGHT, "flex justify-center overflow-hidden bg-muted/40 p-4")}>
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
              Sender, postal address and unsubscribe link are added at send (highlighted in preview).
            </>
          ) : (
            <>
              <TriangleAlertIcon className="size-3.5 text-warn" />
              No unsubscribe footer configured — marketing sends will go out without one.
            </>
          )}
        </p>
      </section>
    </div>
  );
});
