"use client";

import { useEffect, useState } from "react";
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import type { CampaignReview } from "../../campaign-routes";
import { CAMPAIGN_VARIABLE_SAMPLES } from "../../email-content/variables";
import { appendUnsubscribeFooter, type FooterInfo } from "../../template";
import { apiFetch } from "../api-fetch";
import { openEmailPreview } from "../email-content-editor";
import { fillSamples } from "../email-editor/samples";

export const SEND_WARNING = "This emails real customers and can't be undone.";

/** Step 3: read-only summary, the server's checklist and a preview of exactly what will be sent. */
export function ReviewStep({
  campaignPublicId,
  from,
  footer,
  timeZone,
  onReview,
}: {
  campaignPublicId: string;
  from?: string;
  footer?: FooterInfo;
  timeZone: string;
  onReview: (review: CampaignReview | null) => void;
}) {
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  useEffect(() => {
    let live = true;
    apiFetch<CampaignReview>(`/api/notifications/campaigns/${campaignPublicId}/review`)
      .then((r) => {
        if (!live) return;
        setReview(r);
        onReview(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per campaign
  }, [campaignPublicId]);

  if (!review) return <p className="text-muted-foreground text-sm">Checking the campaign…</p>;

  const email = review.content.find((c) => c.channel === "email");
  const html = email?.html
    ? fillSamples(
        footer ? appendUnsubscribeFooter({ html: email.html, text: "" }, footer, { preview: true }).html : email.html,
        CAMPAIGN_VARIABLE_SAMPLES,
        "sample",
      )
    : "";
  const excluded = Object.values(review.breakdown.excluded).reduce((a, b) => a + b, 0);
  const rows: [string, string][] = [
    ["Campaign", review.name],
    ["Subject", email?.subject ?? review.content[0]?.subject ?? "—"],
    ["From", from ?? "—"],
    ["Recipients", `${review.breakdown.eligible.toLocaleString()} eligible · ${excluded.toLocaleString()} left out`],
    [
      "Scheduled",
      review.scheduledAt
        ? `${new Date(review.scheduledAt).toLocaleString([], { timeZone, dateStyle: "medium", timeStyle: "short" })} (${timeZone})`
        : "Not scheduled",
    ],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-5">
        <dl className="divide-y rounded-xl border text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2 rounded-xl border p-4 text-sm" aria-live="polite">
          {review.blocking.length === 0 && review.warnings.length === 0 && (
            <p className="flex items-center gap-2">
              <CircleCheckIcon className="text-success size-4" /> Everything checks out.
            </p>
          )}
          {review.blocking.map((b) => (
            <p key={b.code} className="text-destructive flex items-start gap-2">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" /> {b.message}
            </p>
          ))}
          {review.warnings.map((w) => (
            <p key={w.code} className="flex items-start gap-2">
              <TriangleAlertIcon className="text-warn mt-0.5 size-4 shrink-0" /> {w.message}
            </p>
          ))}
        </div>
      </div>

      {html && (
        <div className="overflow-hidden rounded-xl border">
          <div className="flex h-12 items-center justify-between border-b px-3 text-sm">
            <div className="flex gap-1">
              {(["desktop", "mobile"] as const).map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={device === d ? "secondary" : "ghost"}
                  onClick={() => setDevice(d)}
                  className="capitalize"
                >
                  {d}
                </Button>
              ))}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => openEmailPreview(html)}>
              Open
            </Button>
          </div>
          <div className="bg-muted/40 flex h-[60vh] min-h-[420px] justify-center p-4">
            <iframe
              title="Email preview"
              srcDoc={html}
              sandbox=""
              className={device === "mobile" ? "h-full w-[375px] max-w-full rounded-lg bg-white" : "h-full w-full rounded-lg bg-white"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Explicit, irreversible: shows what is being sent and to how many, and sends that count back. */
export function SendDialog({
  open,
  onOpenChange,
  review,
  sending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  review: CampaignReview;
  sending: boolean;
  onConfirm: () => void;
}) {
  const subject = review.content.find((c) => c.channel === "email")?.subject ?? review.content[0]?.subject ?? "";
  const count = review.breakdown.eligible.toLocaleString();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send this campaign?"
      description={`“${review.name}” — ${subject}. ${count} people will receive it. ${SEND_WARNING}`}
    >
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={sending}>
          {sending ? "Sending…" : `Send to ${count}`}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}

/** Date + time in the app's timezone. The value is wall time; the server converts and validates it. */
export function ScheduleDialog({
  open,
  onOpenChange,
  timeZone,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  timeZone: string;
  busy: boolean;
  onConfirm: (localDateTime: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule this campaign"
      description={`Times are in ${timeZone}.`}
    >
      <div className="space-y-4 pt-2">
        <input
          type="datetime-local"
          aria-label="Send at"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(value)} disabled={busy || !value}>
            {busy ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
