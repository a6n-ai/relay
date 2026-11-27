import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { toast } from "@foundry/ui/toast";
import { useState } from "react";
import { errorText } from "../error-text";
import { LetterView } from "../letter-view";
import { Hint, SectionTitle } from "../page/text";
import { FormItem } from "@foundry/ui/form";

export type ContentValue = { subject: string; html: string; text: string };
export type LetterPreview = { htmlSafe: string; text: string; subject: string };

// The caller decides how a preview is made: a campaign saves unsaved edits first, a template does the same.
export function ContentFields({
  value,
  onChange,
  dataFields,
  disabled = false,
  onPreview,
}: {
  value: ContentValue;
  onChange: (next: ContentValue) => void;
  dataFields: boolean;
  disabled?: boolean;
  onPreview: () => Promise<LetterPreview | null>;
}) {
  const [preview, setPreview] = useState<LetterPreview | null>(null);
  async function show() {
    try {
      setPreview(await onPreview());
    } catch (err) {
      toast.error(errorText(err, "Could not load the preview."));
    }
  }
  return (
    <>
      <Label htmlFor="content-subject">Subject</Label>
      <Input
        id="content-subject"
        value={value.subject}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, subject: e.target.value })}
      />
      <Label htmlFor="content-html">HTML</Label>
      <Textarea
        id="content-html"
        rows={10}
        value={value.html}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, html: e.target.value })}
      />
      <Label htmlFor="content-text">Plain text</Label>
      <Textarea
        id="content-text"
        rows={6}
        value={value.text}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <Hint size="xs">
        Merge fields: {"{{contact.name}}"}, {"{{contact.first_name}}"}, {"{{contact.email}}"}, {"{{unsubscribe_url}}"},{" "}
        {"{{postal_address}}"}
        {dataFields ? <>, {"{{data.<key>}}"}</> : null}
      </Hint>
      <div>
        <Button type="button" variant="outline" onClick={show}>
          Preview
        </Button>
      </div>
      {preview ? (
        <FormItem>
          <SectionTitle as="p">{preview.subject}</SectionTitle>
          <LetterView htmlSafe={preview.htmlSafe} text={preview.text} blockedRemote={0} images={false} onShowImages={() => undefined} />
        </FormItem>
      ) : null}
    </>
  );
}
