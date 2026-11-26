import { Textarea } from "@foundry/ui/textarea";
import type { ConsentSource } from "../do/lists";
import { CONSENT_LABEL } from "./consent-labels";
import { Field } from "./form/field";
import { ChoiceField } from "./form/choice-field";

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
      <Field id={`${idPrefix}-note`} label="Consent note (optional)" hint="Kept with the list as your record of consent.">
        <Textarea id={`${idPrefix}-note`} aria-describedby={`${idPrefix}-note-hint`} rows={2} maxLength={500} value={note} onChange={(e) => onNote(e.target.value)} placeholder="Where did these contacts come from?" />
      </Field>
    </>
  );
}
