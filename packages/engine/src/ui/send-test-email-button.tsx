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
 * The endpoint takes a bare {subject, html, text, to} — no event/campaign
 * context — so it's the same route regardless of caller.
 */
export function SendTestEmailButton({
  subject,
  exportEmail,
  disabled,
}: {
  subject: string;
  exportEmail: () => Promise<{ html: string; text: string }>;
  disabled?: boolean;
}) {
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendTest() {
    if (!subject.trim()) return toast.error("Add a subject first");
    setBusy(true);
    try {
      const { html, text } = await exportEmail();
      await apiFetch("/api/notifications/templates/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, html, text, to: testEmail.trim() || undefined }),
      });
      toast.success(`Test sent${testEmail.trim() ? ` to ${testEmail.trim()}` : ""}`);
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
