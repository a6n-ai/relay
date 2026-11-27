import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthButton, AuthCard, AuthField, AuthForm, AuthLink, AuthText } from "../components/auth-card";
import { FormError } from "../components/form/form-parts";
import { PASSWORD_MAX, PASSWORD_MIN } from "../shared/limits";
import { authFetch } from "../components/lib/auth-fetch";

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
        <AuthLink to="/forgot-password" className="text-foreground underline underline-offset-4">
          Send a new link
        </AuthLink>
      </AuthCard>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8 || password.length > 128) return setError("Use 8 to 128 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setPending(true);
    const res = await authFetch("/reset-password", { newPassword: password, token });
    setPending(false);
    if (!res.ok) return setError(res.error ?? "This reset link is not valid or has expired.");
    await router.navigate({ to: "/sign-in" });
  }

  return (
    <AuthCard title="Choose a new password">
      <AuthForm onSubmit={submit}>
        <AuthField label="New password" id="new-password" type="password" autoComplete="new-password" placeholder="New password" required autoFocus minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} />
        <AuthField label="Confirm new password" id="confirm-password" type="password" autoComplete="new-password" placeholder="Confirm new password" required maxLength={PASSWORD_MAX} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <AuthButton type="submit" disabled={pending}>
          Reset password
        </AuthButton>
      </AuthForm>
      <FormError message={error} />
    </AuthCard>
  );
}
