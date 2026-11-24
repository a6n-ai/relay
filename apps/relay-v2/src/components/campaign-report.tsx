import { Button } from "@foundry/ui/button";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cancelCampaignFn, pauseCampaignFn, previewAudienceFn, resumeCampaignFn, unscheduleCampaignFn } from "../console/campaigns.fns";
import type { AudiencePreview, CampaignStats, CampaignView } from "../do/campaigns";
import { reasonText } from "./error-text";
import { ConfirmDialog } from "./confirm-dialog";
import { FormError } from "./form-error";
import { formatWhen } from "./event-timeline";
import { MeterBar } from "./meter-bar";
import { runAction } from "./run-action";
import { StatTile } from "./stat-tile";
import { StatusBadge } from "./status-badge";
import { useCan } from "./use-can";

const LIVE = 10_000;

export function CampaignReport({ campaign, stats }: { campaign: CampaignView; stats: CampaignStats }) {
  const router = useRouter();
  const canSend = useCan({ campaign: ["send"] });
  const { id, status } = campaign;
  // The audience is counted once for the meter; the polled loader would re-run the whole audience count every tick.
  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  useEffect(() => {
    let live = true;
    previewAudienceFn({ data: { id } })
      .then((a) => live && setAudience(a ?? null))
      .catch(() => live && setAudience(null));
    return () => {
      live = false;
    };
  }, [id]);

  // Counters move while a send runs, so the loader re-reads them on an interval until the campaign settles.
  // Queued mail can still be waiting after the status reads sent, so polling continues while anything is queued.
  const waiting = stats.queued > 0;
  useEffect(() => {
    if (status !== "scheduled" && status !== "sending" && !waiting) return;
    const timer = setInterval(() => void router.invalidate(), LIVE);
    return () => clearInterval(timer);
  }, [status, waiting, router]);

  const act = (action: () => Promise<unknown>, success: string) => runAction(action, success, () => router.invalidate());
  const cancel = (
    <ConfirmDialog
      trigger="Cancel campaign"
      title="Cancel this campaign?"
      description="Queued mail will not be sent. Messages not yet sent will be dropped. Mail already sent is unaffected."
      confirmLabel="Cancel campaign"
      onConfirm={() => void act(() => cancelCampaignFn({ data: { id } }), "Campaign cancelled")}
    />
  );
  const sendable = audience?.sendable ?? 0;
  const percent = sendable > 0 ? (campaign.recipients / sendable) * 100 : 0;
  const tiles: [string, number][] = [
    ["Recipients", campaign.recipients],
    ["Waiting", stats.queued],
    ["Sent", stats.sent],
    ["Delivered", stats.delivered],
    ["Opened", stats.opened],
    ["Clicked", stats.clicked],
    ["Bounced", stats.bounced],
    ["Complaints", stats.complained],
    ["Unsubscribed", stats.unsubscribed],
    ["Suppressed", stats.suppressed],
    ["Failed", stats.failed],
  ];
  const times = [
    campaign.scheduledAt !== null ? `Scheduled ${formatWhen(campaign.scheduledAt)}` : null,
    campaign.startedAt !== null ? `Started ${formatWhen(campaign.startedAt)}` : null,
    campaign.finishedAt !== null ? `Finished ${formatWhen(campaign.finishedAt)}` : null,
  ].filter((t): t is string => t !== null);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {times.map((t) => (
          <span key={t} className="text-sm text-muted-foreground">
            {t}
          </span>
        ))}
      </div>
      <FormError message={status === "paused" ? reasonText(campaign.error) : null} />
      {status === "sending" && (
        <div className="flex items-center gap-3">
          <MeterBar percent={percent} />
          <span className="text-xs tabular-nums text-muted-foreground">
            {campaign.recipients} of {audience ? audience.sendable : "..."}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, value]) => (
          <StatTile key={label} label={label} value={String(value)} />
        ))}
      </div>
      {canSend && (status === "scheduled" || status === "sending" || status === "paused") && (
        <div className="flex flex-wrap gap-2">
          {status === "scheduled" && (
            <Button variant="outline" size="sm" onClick={() => void act(() => unscheduleCampaignFn({ data: { id } }), "Schedule removed")}>
              Unschedule
            </Button>
          )}
          {status === "sending" && (
            <Button variant="outline" size="sm" onClick={() => void act(() => pauseCampaignFn({ data: { id } }), "Campaign paused")}>
              Pause
            </Button>
          )}
          {status === "paused" && (
            <Button variant="outline" size="sm" onClick={() => void act(() => resumeCampaignFn({ data: { id } }), "Campaign resumed")}>
              Resume
            </Button>
          )}
          {cancel}
        </div>
      )}
    </div>
  );
}
