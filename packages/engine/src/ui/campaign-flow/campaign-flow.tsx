"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import type { CampaignReview } from "../../campaign-routes";
import { htmlToText } from "../../email-content/text";
import type { FooterInfo } from "../../template";
import { apiFetch } from "../api-fetch";
import type { AudienceValue, ContactListOption } from "../audience-builder";
import { TextRow, type CampaignContentRow } from "../campaign-content-section";
import type { SaveState } from "../email-editor/autosave";
import { SaveStatus } from "../email-editor/save-status";
import { SendTestEmailButton } from "../send-test-email-button";
import { AudienceStep, type AudienceStepHandle } from "./audience-step";
import { ContentStep, type ContentStepHandle } from "./content-step";
import { FlowShell } from "./flow-shell";
import { ReviewStep, ScheduleDialog, SendDialog } from "./review-step";
import { stepGate, type FlowStep } from "./steps";

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** The guided campaign flow for a draft or scheduled campaign: Content → Audience → Review & Send. */
export function CampaignFlow(props: {
  campaignPublicId: string;
  name: string;
  status: "draft" | "scheduled";
  step: FlowStep;
  /** The campaign's channel; the flow edits one channel per campaign. */
  channel: string;
  /** null until the first save. */
  content: CampaignContentRow | null;
  audience: AudienceValue;
  lists: ContactListOption[];
  timeZone: string;
  footer?: FooterInfo;
  from?: string;
  unsubscribedHref: string;
}) {
  const { campaignPublicId, step, channel } = props;
  const email = channel === "email";
  const router = useRouter();
  const page = `/dashboard/notifications/campaigns/${campaignPublicId}`;
  const api = `/api/notifications/campaigns/${campaignPublicId}`;
  const contentRef = useRef<ContentStepHandle>(null);
  const audienceRef = useRef<AudienceStepHandle>(null);
  const [reviewNonce, setReviewNonce] = useState(0);
  const [editor, setEditor] = useState<{ hasSubject: boolean; hasContent: boolean; save: SaveState }>({
    hasSubject: !!props.content?.subject?.trim(),
    hasContent: !!props.content?.html?.trim(),
    save: { status: "idle", attempt: 0 },
  });
  const [eligible, setEligible] = useState<number | null>(null);
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Text channels save through TextRow + router.refresh, so their state is just the props.
  const hasSubject = email ? editor.hasSubject : !!props.content?.subject?.trim();
  // A provider template (WhatsApp) is content on its own.
  const hasContent = email ? editor.hasContent : !!(props.content?.body?.trim() || props.content?.providerTemplateId);
  const gate = stepGate({ hasSubject, hasContent, eligible: step === "audience" ? eligible : 1, email });
  // After a refused send or schedule, show what the server now says instead of the stale screen.
  const resync = () => {
    router.refresh();
    setReviewNonce((n) => n + 1);
  };
  const go = (to: FlowStep) => router.push(`${page}?step=${to}`);

  async function rename(name: string) {
    try {
      await apiFetch(api, json("PATCH", { name }));
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    }
  }

  async function leaveContent() {
    if (email && !(await contentRef.current?.save())) return;
    go("audience");
  }

  async function send() {
    if (!review) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ queued: number; warning?: string }>(
        `${api}/send`,
        json("POST", { confirmedCount: review.breakdown.eligible }),
      );
      if (res.warning) toast.warning(res.warning);
      else toast.success(`Queued ${res.queued.toLocaleString()} messages`);
      setSendOpen(false);
      router.push(page);
      router.refresh();
    } catch {
      // apiFetch already toasted the reason (422 blocking items, 409 already sending).
      setSendOpen(false);
      resync();
    } finally {
      setBusy(false);
    }
  }

  async function schedule(localDateTime: string | null) {
    setBusy(true);
    try {
      await apiFetch(`${api}/schedule`, json("POST", { localDateTime }));
      toast.success(localDateTime ? "Campaign scheduled" : "Schedule removed");
      setScheduleOpen(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
      resync();
    } finally {
      setBusy(false);
    }
  }

  const reviewEmail = review?.content.find((c) => c.channel === "email");
  const blocked = !review || review.blocking.length > 0;
  // While an audience edit is still saving, leaving would drop it.
  const audienceSettled = eligible !== null;
  const hint = gate.reason && <span className="text-muted-foreground mr-auto text-sm">{gate.reason}</span>;
  const bottom =
    step === "content" ? (
      <>
        {hint}
        {email && (
          <Button variant="outline" onClick={() => void contentRef.current?.save()} disabled={!gate.canLeaveContent}>
            Save draft
          </Button>
        )}
        <Button onClick={leaveContent} disabled={!gate.canLeaveContent}>
          Continue to Audience
        </Button>
      </>
    ) : step === "audience" ? (
      <>
        {hint}
        <Button
          variant="outline"
          onClick={async () => {
            await audienceRef.current?.settle();
            go("content");
          }}
        >
          Back
        </Button>
        <Button onClick={() => go("review")} disabled={!gate.canLeaveAudience}>
          Continue to Review
        </Button>
      </>
    ) : (
      <>
        <Button variant="outline" onClick={() => go("audience")}>
          Back
        </Button>
        {props.status === "scheduled" ? (
          <Button variant="outline" onClick={() => void schedule(null)} disabled={busy}>
            Remove schedule
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setScheduleOpen(true)} disabled={blocked || busy}>
            Schedule…
          </Button>
        )}
        <Button onClick={() => setSendOpen(true)} disabled={blocked || busy}>
          Send now
        </Button>
      </>
    );

  return (
    <FlowShell
      campaignPublicId={campaignPublicId}
      name={props.name}
      status={props.status}
      step={step}
      backHref="/dashboard/notifications/campaigns"
      onRename={rename}
      onBack={async () => {
        if (step === "content" && email && gate.canLeaveContent) await contentRef.current?.save();
        if (step === "audience") await audienceRef.current?.settle();
      }}
      saveStatus={
        step === "content" && email ? (
          <SaveStatus state={editor.save} onRetry={() => void contentRef.current?.save()} onReload={() => location.reload()} />
        ) : undefined
      }
      // Forward moves go through Continue, which saves first; step links only go back.
      reachable={{ content: step === "review" || audienceSettled, audience: step === "review", review: false }}
      bottom={bottom}
    >
      {step === "content" &&
        (email ? (
          <ContentStep
            ref={contentRef}
            campaignPublicId={campaignPublicId}
            content={props.content}
            autosaveDraft={props.status === "draft"}
            footer={props.footer}
            from={props.from}
            onState={setEditor}
          />
        ) : (
          <TextRow
            campaignPublicId={campaignPublicId}
            row={
              props.content ?? {
                channel,
                locale: "en",
                subject: props.name,
                body: "",
                html: null,
                text: null,
                providerTemplateId: null,
                revision: 0,
              }
            }
            editable
          />
        ))}
      {step === "audience" && (
        <AudienceStep
          ref={audienceRef}
          campaignPublicId={campaignPublicId}
          initial={props.audience}
          lists={props.lists}
          timeZone={props.timeZone}
          requiresVerifiedPhone={channel === "sms" || channel === "whatsapp"}
          unsubscribedHref={props.unsubscribedHref}
          onEligible={setEligible}
        />
      )}
      {step === "review" && (
        <div className="space-y-4">
          <ReviewStep
            // Refetch after schedule/unschedule so the summary shows the new state.
            key={`${props.status}:${reviewNonce}`}
            campaignPublicId={campaignPublicId}
            from={props.from}
            footer={props.footer}
            timeZone={props.timeZone}
            onReview={setReview}
          />
          {reviewEmail?.html && (
            <div className="flex justify-end">
              <SendTestEmailButton
                subject={reviewEmail.subject}
                marketing
                exportEmail={async () => ({ html: reviewEmail.html!, text: htmlToText(reviewEmail.html!) })}
              />
            </div>
          )}
          {review && <SendDialog open={sendOpen} onOpenChange={setSendOpen} review={review} sending={busy} onConfirm={send} />}
          <ScheduleDialog
            open={scheduleOpen}
            onOpenChange={setScheduleOpen}
            timeZone={props.timeZone}
            busy={busy}
            onConfirm={(v) => void schedule(v)}
          />
        </div>
      )}
    </FlowShell>
  );
}
