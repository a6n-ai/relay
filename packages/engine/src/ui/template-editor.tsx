"use client";

/* eslint-disable react-hooks/set-state-in-effect --
 * The draft fields are seeded from the row for the active channel/locale tab, and both
 * tab state and draft state live in this one component, so there is no prop to key a
 * remount off. The correct fix is to extract the per-tab form into an inner component
 * keyed by `${channel}-${locale}` and initialise its state from props — a real
 * refactor of a 460-line editor with no test coverage, deliberately deferred rather
 * than attempted alongside a lint sweep.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BellIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "./api-fetch";
import "@uiw/react-md-editor/markdown-editor.css";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Switch } from "@foundry/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { Skeleton } from "@foundry/ui/skeleton";
import { type EmailContentEditorHandle } from "./email-content-editor";
import { EmailTemplateBuilder } from "./email-template-builder";
import type { FooterInfo } from "../template";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

// Shared top-level layout shell — the real render and TemplateEditorSkeleton
// both key off this so the loading state stays structurally in sync.
const editorShell = {
  root: "space-y-4",
  toolbar: "flex flex-wrap items-center gap-4",
  grid: "grid gap-6 lg:grid-cols-2",
  editorCol: "min-w-0 space-y-4",
  previewCol: "lg:sticky lg:top-4 h-fit space-y-2",
} as const;

type Channel = "email" | "in_app";
type Locale = "en" | "fr";

interface Row {
  channel: Channel;
  locale: Locale;
  subject: string;
  body: string;
  html: string;
  text: string;
  enabled: boolean;
}

export function TemplateEditor({
  event,
  variables,
  initial,
  footer,
}: {
  event: string;
  variables: string[];
  initial: Row[];
  /** Some event templates carry kind "marketing" (abandoned-cart, checkout recovery) and get the same CASL footer a campaign does — shown in preview here too. */
  footer?: FooterInfo;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [locale, setLocale] = useState<Locale>("en");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const emailContentRef = useRef<EmailContentEditorHandle>(null);

  // The row for the active channel/locale. The email editor loads its initial
  // content synchronously from this (TipTap won't react to a later prop change),
  // keyed by channel-locale so switching tabs remounts with the right content.
  const current = initial.find((t) => t.channel === channel && t.locale === locale);

  useEffect(() => {
    setSubject(current?.subject ?? "");
    setBody(current?.body ?? "");
    setEnabled(current?.enabled ?? true);
  }, [channel, locale, current]);

  async function save() {
    setBusy(true);
    let payload: Record<string, unknown> = { event, channel, locale, subject, enabled };
    if (channel === "email") {
      if (!emailContentRef.current) {
        setBusy(false);
        toast.error("Editor not ready — please wait and try again");
        return;
      }
      try {
        const out = await emailContentRef.current.exportEmail();
        payload = { ...payload, body: out.body, html: out.html, text: out.text };
      } catch (e) {
        setBusy(false);
        toast.error(e instanceof Error ? e.message : "Couldn't export the email");
        return;
      }
    } else {
      payload = { ...payload, body };
    }
    try {
      await apiFetch("/api/notifications/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success("Template saved");
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={editorShell.root}>
      <div className={editorShell.toolbar}>
        <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <TabsList>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="in_app">In-app</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          <TabsList>
            <TabsTrigger value="en">EN</TabsTrigger>
            <TabsTrigger value="fr">FR</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} /> Enabled
        </label>
      </div>

      {channel === "email" && !footer && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          <span>
            Sender/unsubscribe config missing (UNSUBSCRIBE_SECRET, CAMPAIGN_POSTAL_ADDRESS, CAMPAIGN_BASE_URL) — if
            this template is ever marked marketing kind, no CASL footer would be added.
          </span>
        </div>
      )}

      {channel === "email" ? (
        <EmailTemplateBuilder
          key={`${channel}-${locale}`}
          ref={emailContentRef}
          subject={subject}
          onSubjectChange={setSubject}
          initialBody={current?.body ?? ""}
          initialHtml={current?.html ?? ""}
          variables={variables}
          disabled={busy}
          footer={footer}
          actions={
            <Button onClick={save} disabled={busy}>
              Save
            </Button>
          }
        />
      ) : (
        <>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject / in-app title" />
          <div className={editorShell.grid}>
            <div className={editorShell.editorCol}>
              {variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="rounded bg-muted px-2 py-0.5 font-mono text-xs hover:bg-accent"
                      onClick={() => setBody((b) => `${b}{{${v}}}`)}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              )}
              <div data-color-mode="light">
                <MDEditor value={body} onChange={(v) => setBody(v ?? "")} height={280} />
              </div>
            </div>
            <div className={editorShell.previewCol}>
              <p className="text-xs font-medium text-muted-foreground">Live preview — in-app</p>
              <InAppPreview title={subject} body={body} />
            </div>
          </div>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </>
      )}
    </div>
  );
}

export function TemplateEditorSkeleton() {
  return (
    <div className={editorShell.root}>
      <div className={editorShell.toolbar}>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="ml-auto h-6 w-20" />
      </div>
      <div className={editorShell.grid}>
        <div className={editorShell.editorCol}>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-[600px] w-full rounded-lg" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className={editorShell.previewCol}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[600px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors renderInApp: interpolated title + plaintext body, no markdown/email chrome. */
function InAppPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex gap-3">
        <BellIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground">{title || "Notification title"}</p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body || "Notification body…"}</p>
        </div>
      </div>
    </div>
  );
}
