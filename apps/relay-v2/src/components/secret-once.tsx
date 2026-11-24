import { Button } from "@foundry/ui/button";
import { useState } from "react";

export function SecretOnce({ secret, label, onDone }: { secret: string; label: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">{label}</p>
      <code className="break-all rounded-md bg-muted p-3 font-mono text-sm">{secret}</code>
      <p className="text-sm text-muted-foreground">Copy this now. It won't be shown again.</p>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
