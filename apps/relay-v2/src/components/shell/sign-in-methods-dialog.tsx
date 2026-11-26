import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { useEffect, useState } from "react";
import { FormActions, FormBody, FormError } from "../page/form-parts";
import { Hint } from "../page/text";

const json = { "content-type": "application/json" };

// Linking runs through Better Auth's /link-social, the only flow that may attach Google to a platform admin.
export function SignInMethodsDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/auth/list-accounts")
      .then((res) => (res.ok ? (res.json() as Promise<{ providerId?: string; provider?: string }[]>) : Promise.reject()))
      .then((rows) => setLinked(rows.some((r) => (r.providerId ?? r.provider) === "google")))
      .catch(() => setError("Could not load your sign-in methods."));
  }, []);

  async function linkGoogle() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/link-social", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ provider: "google", callbackURL: window.location.pathname, errorCallbackURL: window.location.pathname }),
      });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) throw new Error("no url");
      window.location.assign(data.url);
    } catch {
      setError("Could not start linking Google. Try again.");
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign-in methods</DialogTitle>
        </DialogHeader>
        <FormBody as="div">
          <Hint size="xs">Email code is always available.</Hint>
          <p className="text-sm">{linked === null ? "Checking Google…" : linked ? "Google is linked to your account." : "Google is not linked."}</p>
          <FormError message={error} />
          <FormActions cancel>
            {linked === false ? (
              <Button type="button" onClick={linkGoogle} disabled={pending}>
                Link Google
              </Button>
            ) : null}
          </FormActions>
        </FormBody>
      </DialogContent>
    </Dialog>
  );
}
