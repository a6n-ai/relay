import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { useEffect, useState } from "react";
import { FormActions, FormBody, FormError } from "../form/form-parts";
import { signInErrorText } from "../../shared/sign-in";
import { Hint } from "../form/text";
import { authFetch } from "../lib/auth-fetch";

export const LINK_MARKER = "sign-in-methods";

// Linking runs through Better Auth's /link-social, the only flow that may attach Google to a platform admin.
export function SignInMethodsDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(() => signInErrorText(new URLSearchParams(window.location.search).get("error") ?? undefined));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void authFetch<{ providerId?: string; provider?: string }[]>("/list-accounts").then((res) => {
      if (res.ok && res.data) setLinked(res.data.some((r) => (r.providerId ?? r.provider) === "google"));
      else setError("Could not load your sign-in methods.");
    });
  }, []);

  async function linkGoogle() {
    setPending(true);
    setError(null);
    const res = await authFetch<{ url?: string }>("/link-social", {
      provider: "google",
      callbackURL: window.location.pathname,
      errorCallbackURL: `${window.location.pathname}?${LINK_MARKER}=1`,
    });
    if (!res.ok || !res.data?.url) {
      setError("Could not start linking Google. Try again.");
      setPending(false);
      return;
    }
    window.location.assign(res.data.url);
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
          <FormActions cancel cancelLabel="Close">
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
