import { Button } from "@foundry/ui/button";
import { useState } from "react";
import { FormError } from "./form-error";
import { FormStack, FormActions } from "./page/form-parts";
import { Hint, SectionTitle } from "./page/text";

export function SecretOnce({ secret, label, onDone }: { secret: string; label: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <FormStack>
      <SectionTitle as="p">{label}</SectionTitle>
      <code className="break-all rounded-md bg-muted p-3 font-mono text-sm">{secret}</code>
      <Hint>Copy this now. It won't be shown again.</Hint>
      <FormError message={copyFailed ? "Copy failed, select the key" : null} />
      <FormActions>
        <Button
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
        <Button onClick={onDone}>Done</Button>
      </FormActions>
    </FormStack>
  );
}
