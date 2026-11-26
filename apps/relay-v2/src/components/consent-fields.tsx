import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import type { ConsentSource } from "../do/lists";
import { CONSENT_LABEL } from "./consent-labels";
import { ChoiceField } from "./form/choice-field";
import { Hint } from "./page/text";

const CONSENT_HELP: Record<ConsentSource, string> = {
  purchase: "They bought from you.",
  express_optin: "They asked to hear from you.",
  event_signup: "They signed up at an event.",
  import_other: "Another source. Describe it in the note.",
};

const OPTIONS = (Object.keys(CONSENT_LABEL) as ConsentSource[]).map((s) => ({
  value: s,
  label: CONSENT_LABEL[s],
  description: CONSENT_HELP[s],
}));

export function ConsentFields({
  idPrefix,
  consent,
  onConsent,
  note,
  onNote,
}: {
  idPrefix: string;
  consent: ConsentSource;
  onConsent: (c: ConsentSource) => void;
  note: string;
  onNote: (n: string) => void;
}) {
  return (
    <>
      <ChoiceField id={`${idPrefix}-consent`} label="Consent" value={consent} onChange={(v) => onConsent(v as ConsentSource)} options={OPTIONS} />
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-note`}>Consent note (optional)</Label>
        <Textarea id={`${idPrefix}-note`} rows={2} maxLength={500} value={note} onChange={(e) => onNote(e.target.value)} placeholder="Where did these contacts come from?" />
        <Hint size="xs">Kept with the list as your record of consent.</Hint>
      </div>
    </>
  );
}
