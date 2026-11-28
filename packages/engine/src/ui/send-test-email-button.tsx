"use client";

import { useId, useState } from "react";
import { toast } from "@foundry/ui/toast";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiAction, apiFetch } from "./api-fetch";

/**
 * "Send test" button and dialog shared by every place an admin edits an email —
 * event templates and campaigns alike — instead of each screen wiring its
 * own copy. Defaults to the acting admin's own address; an explicit
 * recipient lets them test across clients.
 *
 * The endpoint takes {subject, html, text, to, marketing}. `marketing` makes
 * the test leave from the campaign sender with the CASL footer, as a real
 * campaign send does; without it the test goes out as transactional mail.
 */
export function SendTestEmailButton({
  subject,
  exportEmail,
  disabled,
  marketing,
}: {
  subject: string;
  exportEmail: () => Promise<{ html: string; text: string }>;
  disabled?: boolean;
  marketing?: boolean;
}) {
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const inputId = useId();

  async function sendTest() {
    if (!subject.trim()) return toast.error("Add a subject first");
    setBusy(true);
    const res = await apiAction(
      exportEmail().then(({ html, text }) =>
        apiFetch<{ sent: boolean; footerIncluded: boolean }>("/api/notifications/templates/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, html, text, to: testEmail.trim() || undefined, marketing }),
        }),
      ),
    );
    setBusy(false);
    if (!res) return;
    setOpen(false);
    const dest = testEmail.trim() ? ` to ${testEmail.trim()}` : "";
    if (!marketing || res.data.footerIncluded) {
      toast.success(`Test sent${dest}`);
    } else {
      toast.warning(`Test sent${dest} — no unsubscribe footer (sender/unsubscribe config missing)`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" disabled={disabled || busy} />}>
        Send test
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={inputId}>Recipient</Label>
          <Input
            id={inputId}
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            // Not a <form>: this can sit inside a caller's form.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (!disabled && !busy) void sendTest();
            }}
            placeholder="test recipient (defaults to you)"
          />
        </div>
        <DialogFooter>
          <Button type="button" onClick={sendTest} disabled={disabled || busy}>
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
