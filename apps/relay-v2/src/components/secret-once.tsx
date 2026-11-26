import { Button } from "@foundry/ui/button";
import { useState } from "react";
import { FormError } from "./page/form-parts";
import { FormBody, FormActions } from "./page/form-parts";
import { Hint, SectionTitle } from "./page/text";

export function SecretOnce({ secret, label, onDone }: { secret: string; label: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <FormBody as="div">
      <SectionTitle as="p">{label}</SectionTitle>
      <code className="break-all rounded-md bg-muted p-3 font-mono text-sm">{secret}</code>
      <Hint>Copy this now. It won't be shown again.</Hint>
      <FormError message={copyFailed ? "Copy failed. Select the text and copy it." : null} />
      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
            } catch {
              setCopyFailed(true);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" onClick={onDone}>Done</Button>
      </FormActions>
    </FormBody>
  );
}
