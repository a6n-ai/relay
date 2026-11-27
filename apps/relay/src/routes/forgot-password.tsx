import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthButton, AuthCard, AuthField, AuthForm, AuthLink, AuthText } from "../components/auth-card";
import { FormError } from "../components/form/form-parts";
import { authFetch } from "../components/lib/auth-fetch";

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
    const res = await authFetch("/request-password-reset", { email, redirectTo: "/reset-password" });
    setPending(false);
    if (res.ok) setSent(true);
    else setError(res.error ?? "Could not send the link. Try again.");
  }

  return (
    <AuthCard title="Reset your password" footer="Access is by invite. Ask your workspace owner.">
      {sent ? (
        <AuthText>If an account exists, we sent a reset link.</AuthText>
      ) : (
        <AuthForm onSubmit={submit}>
          <AuthField label="Email" id="email" name="email" type="email" autoComplete="email" placeholder="Email address" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <AuthButton type="submit" disabled={pending}>
            Send reset link
          </AuthButton>
        </AuthForm>
      )}
      <FormError message={error} />
      <AuthLink to="/sign-in">
        Back to sign in
      </AuthLink>
    </AuthCard>
  );
}
