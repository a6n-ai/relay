import { Label } from "@foundry/ui/label";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthButton, AuthCard, AuthInput, AuthText } from "../components/auth-card";
import { FormError } from "../components/page/form-parts";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset your Relay password" }, { name: "robots", content: "noindex" }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/reset-password" }),
      });
      if (res.status === 429) setError("Too many tries. Try again in a few minutes.");
      else if (!res.ok) setError("Could not send the link. Try again.");
      else setSent(true);
    } catch {
      setError("Could not reach Relay. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="Reset your password" footer="Access is by invite. Ask your workspace owner.">
      {sent ? (
        <AuthText>If an account exists, we sent a reset link.</AuthText>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <AuthInput id="email" name="email" type="email" autoComplete="email" placeholder="Email address" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <AuthButton type="submit" disabled={pending}>
            Send reset link
          </AuthButton>
        </form>
      )}
      <FormError message={error} />
      <Link to="/sign-in" className="text-center text-sm text-muted-foreground hover:text-foreground">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
