import { TextField } from "../form/text-field";
import { toast } from "@foundry/ui/toast";
import { type FormEvent, useState } from "react";
import { scheduleCampaignFn } from "../../console/campaigns.fns";
import { ChoiceControl } from "../form/choice-field";
import { Field } from "../form/field";
import { CreateDialog } from "../create-dialog";
import { FormError, FormBody, FormActions } from "../page/form-parts";
import { useSubmit } from "../use-submit";

export function ScheduleDialog({
  campaignId,
  recipients,
  beforeSubmit,
  onDone,
}: {
  campaignId: string;
  recipients: number | null;
  beforeSubmit: () => Promise<string | null>;
  onDone: () => void;
}) {
  return (
    <CreateDialog trigger="Send campaign" title="Send campaign">
      {(done) => (
        <ScheduleForm
          campaignId={campaignId}
          recipients={recipients}
          beforeSubmit={beforeSubmit}
          done={() => {
            done();
            onDone();
          }}
        />
      )}
    </CreateDialog>
  );
}

// The datetime-local value is read as the browser's local time, so Date gives the UTC instant the server stores.
function ScheduleForm({
  campaignId,
  recipients,
  beforeSubmit,
  done,
}: {
  campaignId: string;
  recipients: number | null;
  beforeSubmit: () => Promise<string | null>;
  done: () => void;
}) {
  const [mode, setMode] = useState<"now" | "at">("now");
  const [when, setWhen] = useState("");
  const [whenError, setWhenError] = useState<string | null>(null);
  const { pending, error, setError, run } = useSubmit();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const at = mode === "now" ? Date.now() : new Date(when).getTime();
    if (!Number.isFinite(at)) {
      setWhenError("Pick a date and time.");
      return;
    }
    if (mode === "at" && at <= Date.now()) {
      setWhenError("Pick a time in the future.");
      return;
    }
    await run(async () => {
      const saveError = await beforeSubmit();
      if (saveError) {
        setError(saveError);
        return;
      }
      await scheduleCampaignFn({ data: { id: campaignId, at } });
      toast.success(mode === "now" ? "Campaign sending" : "Campaign scheduled");
      done();
    }, mode === "now" ? "Could not send this campaign." : "Could not schedule this campaign.");
  }
  return (
    <FormBody onSubmit={submit}>
      <Field id="schedule-mode" label="When to send" hideLabel htmlFor={null}>
      <ChoiceControl
        id="schedule-mode"
        labelledBy="schedule-mode-label"
        autoFocus
        mode="segmented"
        value={mode}
        onChange={(v) => {
          setMode(v as "now" | "at");
          setWhenError(null);
        }}
        options={[
          { value: "now", label: "Now" },
          { value: "at", label: "Later" },
        ]}
      />
      </Field>
      {mode === "at" ? (
        <TextField
          id="schedule-time"
          label="Send time"
          hint={`Times are in your time zone: ${zone}.`}
          type="datetime-local"
          value={when}
          error={whenError}
          onClearError={() => setWhenError(null)}
          required
          onChange={(e) => setWhen(e.target.value)}
        />
      ) : recipients !== null ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          Sends to {recipients} {recipients === 1 ? "recipient" : "recipients"} now.
        </p>
      ) : null}
      <FormError message={error} />
      <FormActions
        cancel
        pending={pending}
        pendingLabel={mode === "now" ? "Sending…" : "Scheduling…"}
        submitLabel={mode === "now" ? "Send campaign" : "Schedule campaign"}
        disabled={mode === "at" && !when}
        disabledReason="Pick a date and time first."
      />
    </FormBody>
  );
}
