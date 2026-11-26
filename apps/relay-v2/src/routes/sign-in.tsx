import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@foundry/ui/input-otp";
import { Label } from "@foundry/ui/label";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AuthCard } from "../components/auth-card";
import { FormError } from "../components/page/form-parts";
import { safeRedirect } from "../console/shell.fns";
import { Hint } from "../components/page/text";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: SignIn,
});

const json = { "content-type": "application/json" };
const TOO_MANY = "Too many codes. Try again in a few minutes.";
const RESEND_SECONDS = 30;
const OFFLINE = "Could not reach Relay. Check your connection and try again.";

function SignIn() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // The countdown is UX only: the server limits sends to 5 per 10 minutes and answers 429.
  async function requestCode(): Promise<boolean> {
    setPending(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ email, type: "sign-in" }),
      });
    } catch {
      setError(OFFLINE);
      return false;
    } finally {
      setPending(false);
    }
    if (res.status === 429) {
      setError(TOO_MANY);
      return false;
    }
    if (!res.ok) {
      setError("Could not send a code. Check the address and try again.");
      return false;
    }
    setWait(RESEND_SECONDS);
    return true;
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (await requestCode()) setStep("code");
  }

  async function verify(code: string) {
    setPending(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ email, otp: code }),
      });
    } catch {
      return setError(OFFLINE);
    } finally {
      setPending(false);
    }
    if (res.status === 429) return setError(TOO_MANY);
    if (!res.ok) return setError("That code is not right. Try again.");
    await router.navigate({ href: safeRedirect(redirect) });
  }

  return (
    <AuthCard title="Sign in to Relay">
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
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
          <Hint>Enter the 6-digit code we sent to {email}.</Hint>
          <InputOTP autoFocus maxLength={6} pattern="digits" value={otp} onChange={setOtp} onComplete={verify} aria-label="Sign-in code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button type="submit" disabled={pending || otp.length !== 6}>
            Sign in
          </Button>
          <Button type="button" variant="outline" disabled={pending || wait > 0} onClick={() => void requestCode()}>
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStep("email");
              setOtp("");
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </form>
      )}
      <FormError message={error} />
    </AuthCard>
  );
}
