import { Button } from "@foundry/ui/button";
import { TextField } from "../form/text-field";
import { Checkbox } from "@foundry/ui/checkbox";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { setPasswordFn } from "../../console/password.fns";
import { errorText } from "../error-text";
import { FormError } from "../page/form-parts";
import { SettingsCard } from "../page/settings-card";
import { PASSWORD_MAX, PASSWORD_MIN } from "../../shared/limits";

const json = { "content-type": "application/json" };

// Setting goes through a server function (setPassword has no HTTP route); changing goes through Better Auth with the current password.
export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [others, setOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return setError(`Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`);
    if (next !== confirm) return setError("The passwords do not match.");
    setPending(true);
    try {
      if (hasPassword) {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: json,
          body: JSON.stringify({ currentPassword: current, newPassword: next, revokeOtherSessions: others }),
        });
        if (res.status === 429) return setError("Too many tries. Try again in a few minutes.");
        if (res.status === 403) return setError("Sign in again to set a password.");
        if (!res.ok) return setError(res.status === 400 ? "Your current password is wrong." : "Could not change the password. Try again.");
      } else {
        await setPasswordFn({ data: { newPassword: next } });
      }
      toast.success(hasPassword ? "Password changed" : "Password set");
      setCurrent("");
      setNext("");
      setConfirm("");
      setOthers(false);
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not save the password."));
    } finally {
      setPending(false);
    }
  }

  const blocked = !next || !confirm || (hasPassword && !current);

  return (
    <SettingsCard
      title="Password"
      footer={`At least ${PASSWORD_MIN} characters.`}
      disabledReason={blocked && !pending ? (hasPassword && !current ? "Enter your current password." : "Enter and confirm the new password.") : undefined}
      description={
        hasPassword
          ? "Change the password you sign in with."
          : "Sign in with a password as well as an email code. You can still use the code."
      }
      action={
        <Button type="submit" form="password-form" variant="outline" disabled={pending || blocked}>
          {pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
        </Button>
      }
    >
      <form id="password-form" onSubmit={submit} className="grid gap-3">
        {hasPassword ? (
          <TextField id="current-password" label="Current password" type="password" autoComplete="current-password" maxLength={PASSWORD_MAX} value={current} onChange={(e) => setCurrent(e.target.value)} />
        ) : null}
        <TextField id="new-password" label="New password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={next} onChange={(e) => setNext(e.target.value)} />
        <TextField id="confirm-password" label="Confirm new password" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {hasPassword ? (
          <Label className="font-normal">
            <Checkbox checked={others} onCheckedChange={(on) => setOthers(on === true)} />
            Sign out my other sessions
          </Label>
        ) : null}
        <FormError message={error} />
      </form>
    </SettingsCard>
  );
}
