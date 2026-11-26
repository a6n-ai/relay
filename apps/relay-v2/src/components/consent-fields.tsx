import { useState } from "react";
import { Button } from "@foundry/ui/button";
import { Textarea } from "@foundry/ui/textarea";
import type { ConsentSource } from "../do/lists";
import { CONSENT_LABEL } from "./consent-labels";
import { Field } from "./form/field";
import { ChoiceField } from "./form/choice-field";

const OPTIONS = (Object.keys(CONSENT_LABEL) as ConsentSource[]).map((s) => ({ value: s, label: CONSENT_LABEL[s] }));

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
  const [noteOpen, setNoteOpen] = useState(note.length > 0);
  return (
    <>
      <ChoiceField id={`${idPrefix}-consent`} label="How did these people agree to hear from you?" value={consent} onChange={(v) => onConsent(v as ConsentSource)} options={OPTIONS} />
      {noteOpen ? (
        <Field id={`${idPrefix}-note`} label="Note (optional)" hint="Kept with the list as your record of where they came from.">
          <Textarea id={`${idPrefix}-note`} aria-describedby={`${idPrefix}-note-hint`} rows={2} maxLength={500} value={note} onChange={(e) => onNote(e.target.value)} placeholder="Where did these contacts come from?" />
        </Field>
      ) : (
        <div>
          <Button type="button" variant="link" className="px-0" onClick={() => setNoteOpen(true)}>
            Add a note
          </Button>
        </div>
      )}
    </>
  );
}
