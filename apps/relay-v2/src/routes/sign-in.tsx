import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@foundry/ui/input-otp";
import { Label } from "@foundry/ui/label";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AuthCard } from "../components/auth-card";
import { FormError } from "../components/page/form-parts";
import { authOptionsFn, safeRedirect } from "../console/shell.fns";
import { signInErrorText } from "../lib/auth/google";
import { Hint } from "../components/page/text";

const SITE = "https://relay.a6n.ai";
const TITLE = "Sign in to Relay";
const DESCRIPTION = "Sign in to Relay with a one-time code sent to your email, or with Google.";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Relay" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE}/sign-in` },
      { property: "og:image", content: `${SITE}/landing/og.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${SITE}/landing/og.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE}/sign-in` }],
  }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
    ...(typeof search.redirect === "string" ? { redirect: search.redirect } : {}),
    ...(typeof search.error === "string" ? { error: search.error } : {}),
  }),
  loader: () => authOptionsFn(),
  component: SignIn,
});

const json = { "content-type": "application/json" };
const TOO_MANY = "Too many codes. Try again in a few minutes.";
const RESEND_SECONDS = 30;
const OFFLINE = "Could not reach Relay. Check your connection and try again.";

function SignIn() {
  const router = useRouter();
  const { redirect, error: errorCode } = Route.useSearch();
  const { google } = Route.useLoaderData();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(signInErrorText(errorCode));
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

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const target = safeRedirect(redirect);
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: json,
        body: JSON.stringify({
          provider: "google",
          callbackURL: target,
          errorCallbackURL: `/sign-in?redirect=${encodeURIComponent(target)}`,
        }),
      });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) throw new Error("no url");
      window.location.assign(data.url);
    } catch {
      setError(signInErrorText("google_failed"));
      setPending(false);
    }
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
    <AuthCard title="Sign in to Relay" footer="Access is by invite. Ask your workspace owner.">
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          {google ? (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void signInWithGoogle()}>
                <GoogleMark />
                Continue with Google
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
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
            Continue with email
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.200 7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800l3.400-3.400A12 12 0 0 0 1.400 6.500l4 3.100C6.300 6.900 8.900 4.800 12 4.800Z" />
    </svg>
  );
}
