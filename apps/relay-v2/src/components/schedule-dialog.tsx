import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { type FormEvent, useState } from "react";
import { scheduleCampaignFn } from "../console/campaigns.fns";
import { ChoiceControl } from "./form/choice-field";
import { CreateDialog } from "./create-dialog";
import { errorText } from "./error-text";
import { FormError, FormBody, FormActions } from "./page/form-parts";
import { Hint } from "./page/text";

export function ScheduleDialog({
  campaignId,
  beforeSubmit,
  onDone,
}: {
  campaignId: string;
  beforeSubmit: () => Promise<string | null>;
  onDone: () => void;
}) {
  return (
    <CreateDialog trigger="Schedule…" title="Schedule campaign">
      {(done) => (
        <ScheduleForm
          campaignId={campaignId}
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
  beforeSubmit,
  done,
}: {
  campaignId: string;
  beforeSubmit: () => Promise<string | null>;
  done: () => void;
}) {
  const [mode, setMode] = useState<"now" | "at">("now");
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const at = mode === "now" ? Date.now() : new Date(when).getTime();
    if (!Number.isFinite(at)) {
      setError("Pick a date and time.");
      return;
    }
    if (mode === "at" && at <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const saveError = await beforeSubmit();
      if (saveError) {
        setError(saveError);
        return;
      }
      await scheduleCampaignFn({ data: { id: campaignId, at } });
      toast.success("Campaign scheduled");
      done();
    } catch (err) {
      setError(errorText(err, "Could not schedule this campaign."));
    } finally {
      setPending(false);
    }
  }
  return (
    <FormBody onSubmit={submit}>
      <ChoiceControl
        id="schedule-mode"
        autoFocus
        mode="segmented"
        value={mode}
        onChange={(v) => setMode(v as "now" | "at")}
        options={[
          { value: "now", label: "Send now" },
          { value: "at", label: "Schedule for later" },
        ]}
      />
      <Input
        type="datetime-local"
        aria-label="Send time"
        value={when}
        disabled={mode !== "at"}
        required={mode === "at"}
        onChange={(e) => setWhen(e.target.value)}
      />
      <Hint size="xs">Times are in your time zone: {zone}.</Hint>
      <FormError message={error} />
      <FormActions
        cancel
        pending={pending}
        pendingLabel={mode === "now" ? "Sending…" : "Scheduling…"}
        submitLabel={mode === "now" ? "Send now" : "Schedule"}
      />
    </FormBody>
  );
}
