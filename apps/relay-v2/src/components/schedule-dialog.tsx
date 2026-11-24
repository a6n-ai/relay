import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { toast } from "@foundry/ui/toast";
import { type FormEvent, useState } from "react";
import { scheduleCampaignFn } from "../console/campaigns.fns";
import { CreateDialog } from "./create-dialog";
import { errorText } from "./error-text";
import { FormError } from "./form-error";

export function ScheduleDialog({ campaignId, onDone }: { campaignId: string; onDone: () => void }) {
  return (
    <CreateDialog trigger="Schedule…" title="Schedule campaign">
      {(done) => (
        <ScheduleForm
          campaignId={campaignId}
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
function ScheduleForm({ campaignId, done }: { campaignId: string; done: () => void }) {
  const [mode, setMode] = useState<"now" | "at">("now");
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const at = mode === "now" ? Date.now() : new Date(when).getTime();
    if (!Number.isFinite(at)) {
      setError("Pick a date and time.");
      return;
    }
    setPending(true);
    setError(null);
    try {
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
    <form onSubmit={submit} className="grid gap-3">
      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "now" | "at")} aria-label="When to send">
        <Label htmlFor="schedule-now" className="flex items-center gap-2">
          <RadioGroupItem id="schedule-now" value="now" />
          Send now
        </Label>
        <Label htmlFor="schedule-at" className="flex items-center gap-2">
          <RadioGroupItem id="schedule-at" value="at" />
          At
        </Label>
      </RadioGroup>
      <Input
        type="datetime-local"
        aria-label="Send time"
        value={when}
        disabled={mode !== "at"}
        required={mode === "at"}
        onChange={(e) => setWhen(e.target.value)}
      />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || (mode === "at" && !when)}>
          Schedule
        </Button>
      </div>
    </form>
  );
}
