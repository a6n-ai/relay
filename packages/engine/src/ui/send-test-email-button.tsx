"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { apiFetch } from "./api-fetch";

/**
 * "Send test" affordance shared by every place an admin edits an email —
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

  async function sendTest() {
    if (!subject.trim()) return toast.error("Add a subject first");
    setBusy(true);
    try {
      const { html, text } = await exportEmail();
      const res = await apiFetch<{ sent: boolean; footerIncluded: boolean }>("/api/notifications/templates/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, html, text, to: testEmail.trim() || undefined, marketing }),
      });
      const dest = testEmail.trim() ? ` to ${testEmail.trim()}` : "";
      if (!marketing || res.footerIncluded) {
        toast.success(`Test sent${dest}`);
      } else {
        toast.warning(`Test sent${dest} — no unsubscribe footer (sender/unsubscribe config missing)`);
      }
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Input
        type="email"
        value={testEmail}
        onChange={(e) => setTestEmail(e.target.value)}
        placeholder="test recipient (defaults to you)"
        className="max-w-64"
      />
      <Button type="button" variant="outline" onClick={sendTest} disabled={disabled || busy}>
        Send test
      </Button>
    </>
  );
}
