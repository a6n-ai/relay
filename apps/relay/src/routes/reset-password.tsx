import { Label } from "@foundry/ui/label";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthButton, AuthCard, AuthInput, AuthText } from "../components/auth-card";
import { FormError } from "../components/page/form-parts";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Choose a new Relay password" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    ...(typeof search.token === "string" ? { token: search.token } : {}),
    ...(typeof search.error === "string" ? { error: search.error } : {}),
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const router = useRouter();
  const { token, error: linkError } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token || linkError) {
    return (
      <AuthCard title="Link expired">
        <AuthText>This reset link is not valid or has expired.</AuthText>
        <Link to="/forgot-password" className="text-center text-sm text-foreground underline underline-offset-4">
          Send a new link
        </Link>
      </AuthCard>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8 || password.length > 128) return setError("Use 8 to 128 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setPending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (res.status === 429) return setError("Too many tries. Try again in a few minutes.");
      if (!res.ok) return setError("This reset link is not valid or has expired.");
      await router.navigate({ to: "/sign-in" });
    } catch {
      setError("Could not reach Relay. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Label htmlFor="new-password" className="sr-only">
          New password
        </Label>
        <AuthInput id="new-password" type="password" autoComplete="new-password" placeholder="New password" required autoFocus minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Label htmlFor="confirm-password" className="sr-only">
          Confirm new password
        </Label>
        <AuthInput id="confirm-password" type="password" autoComplete="new-password" placeholder="Confirm new password" required maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <AuthButton type="submit" disabled={pending}>
          Reset password
        </AuthButton>
      </form>
      <FormError message={error} />
    </AuthCard>
  );
}
