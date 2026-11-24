import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@foundry/ui/input-otp";
import { Label } from "@foundry/ui/label";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { safeRedirect } from "../console/shell.fns";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: SignIn,
});

const json = { "content-type": "application/json" };
const TOO_MANY = "Too many codes. Try again in a few minutes.";

function SignIn() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    setPending(false);
    if (res.status === 429) return setError(TOO_MANY);
    if (!res.ok) return setError("Could not send a code. Check the address and try again.");
    setStep("code");
  }

  async function verify(code: string) {
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, otp: code }),
    });
    setPending(false);
    if (res.status === 429) return setError(TOO_MANY);
    if (!res.ok) return setError("That code is not right. Try again.");
    await router.navigate({ href: safeRedirect(redirect) });
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-medium">Sign in to Relay</h1>
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={pending}>
            Send code
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            verify(otp);
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-muted-foreground">Enter the 6-digit code we sent to {email}.</p>
          <InputOTP maxLength={6} pattern="digits" value={otp} onChange={setOtp} onComplete={verify} aria-label="Sign-in code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button type="submit" disabled={pending || otp.length !== 6}>
            Sign in
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </main>
  );
}
