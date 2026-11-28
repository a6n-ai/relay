"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlertIcon } from "lucide-react";
import { toast } from "@foundry/ui/toast";
import { Button } from "@foundry/ui/button";
import type { CampaignReview } from "../../campaign-routes";
import { htmlToText } from "../../email-content/text";
import type { FooterInfo } from "../../template";
import { apiAction, apiFetch } from "../api-fetch";
import type { AudienceValue, ContactListOption } from "../audience-builder";
import { TextRow, type CampaignContentRow } from "../campaign-content-section";
import type { SaveState } from "../email-editor/autosave";
import { SaveStatus } from "../email-editor/save-status";
import { SendTestEmailButton } from "../send-test-email-button";
import { AudienceStep, type AudienceStepHandle } from "./audience-step";
import { ContentStep, type ContentStepHandle } from "./content-step";
import { FlowShell } from "./flow-shell";
import { ReviewStep, ScheduleDialog, SendDialog } from "./review-step";
import { stepGate, testSource, type FlowStep } from "./steps";

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
  /** Page-level buttons for the header, e.g. Duplicate and Delete. */
  actions?: ReactNode;
}) {
  const { campaignPublicId, step, channel } = props;
  const email = channel === "email";
  const router = useRouter();
  const page = `/dashboard/notifications/campaigns/${campaignPublicId}`;
  const api = `/api/notifications/campaigns/${campaignPublicId}`;
  const contentRef = useRef<ContentStepHandle>(null);
  const audienceRef = useRef<AudienceStepHandle>(null);
  const [reviewNonce, setReviewNonce] = useState(0);
  const [editor, setEditor] = useState<{ subject: string; hasContent: boolean; save: SaveState }>({
    subject: props.content?.subject ?? "",
    hasContent: !!props.content?.html?.trim(),
    save: { status: "idle", attempt: 0 },
  });
  const [eligible, setEligible] = useState<number | null>(null);
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Text channels save through TextRow + router.refresh, so their state is just the props.
  const hasSubject = !!(email ? editor.subject : props.content?.subject)?.trim();
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
    if (await apiAction(apiFetch(api, json("PATCH", { name })))) router.refresh();
  }

  async function leaveContent() {
    if (email && !(await contentRef.current?.save())) return;
    go("audience");
  }

  async function send() {
    if (!review) return;
    setBusy(true);
    const res = await apiAction(
      apiFetch<{ queued: number; warning?: string }>(
        `${api}/send`,
        json("POST", { confirmedCount: review.breakdown.eligible }),
      ),
    );
    setBusy(false);
    setSendOpen(false);
    if (!res) return resync(); // apiFetch toasted the reason (422 blocking items, 409 already sending)
    if (res.data.warning) toast.warning(res.data.warning);
    else toast.success(`Queued ${res.data.queued.toLocaleString()} messages`);
    router.push(page);
    router.refresh();
  }

  async function schedule(localDateTime: string | null) {
    setBusy(true);
    const res = await apiAction(apiFetch(`${api}/schedule`, json("POST", { localDateTime })));
    setBusy(false);
    if (!res) return resync();
    toast.success(localDateTime ? "Campaign scheduled" : "Schedule removed");
    setScheduleOpen(false);
    router.refresh();
  }

  const reviewEmail = review?.content.find((c) => c.channel === "email");
  const blocked = !review || review.blocking.length > 0;
  const test = testSource(step, email, reviewEmail?.html);
  // While an audience edit is still saving, leaving would drop it.
  const audienceSettled = eligible !== null;
  const hint = gate.reason && <span className="text-muted-foreground mr-auto w-full text-sm sm:w-auto">{gate.reason}</span>;
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
      actions={
        <>
          {test === "editor" && (
            <SendTestEmailButton
              subject={editor.subject}
              marketing
              exportEmail={async () => {
                if (!contentRef.current) throw new Error("editor not ready");
                return contentRef.current.exportTest();
              }}
            />
          )}
          {test === "review" && (
            <SendTestEmailButton
              subject={reviewEmail!.subject}
              marketing
              exportEmail={async () => ({ html: reviewEmail!.html!, text: htmlToText(reviewEmail!.html!) })}
            />
          )}
          {props.actions}
        </>
      }
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
      {/* Same rule as the checklist's "footer" item, shown from step 1 so nobody builds an email that can never send. */}
      {email && !props.footer && (
        <p role="alert" className="text-destructive flex items-start gap-2 rounded-xl border border-destructive/40 p-4 text-sm">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          No unsubscribe footer: sender details (postal address, unsubscribe link) are not configured, so this campaign
          can&apos;t be sent. Ask an engineer to set them.
        </p>
      )}
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
