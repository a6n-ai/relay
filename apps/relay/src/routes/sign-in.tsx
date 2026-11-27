import { InputOTP, InputOTPGroup, InputOTPSlot } from "@foundry/ui/input-otp";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AuthButton, AuthCard, AuthField, AuthForm, AuthLink, AuthText, authLink } from "../components/auth-card";
import { FormError } from "../components/page/form-parts";
import { authOptionsFn } from "../console/shell.fns";
import { safeRedirect } from "../shared/redirect";
import { signInErrorText } from "../auth/google";
import { PASSWORD_MAX } from "../shared/limits";
import { SITE_ORIGIN } from "../shared/site";
import { authFetch } from "../components/lib/auth-fetch";

const TITLE = "Sign in to Relay";
const DESCRIPTION = "Sign in to Relay with a one-time code sent to your email, a password, or Google.";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Relay" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/sign-in` },
      { property: "og:image", content: `${SITE_ORIGIN}/landing/og.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${SITE_ORIGIN}/landing/og.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/sign-in` }],
  }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
    ...(typeof search.redirect === "string" ? { redirect: search.redirect } : {}),
    ...(typeof search.error === "string" ? { error: search.error } : {}),
  }),
  loader: () => authOptionsFn(),
  component: SignIn,
});

const TOO_MANY_CODES = "Too many codes. Try again in a few minutes.";
const RESEND_SECONDS = 30;

function SignIn() {
  const router = useRouter();
  const { redirect, error: errorCode } = Route.useSearch();
  const { google } = Route.useLoaderData();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
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
    const res = await authFetch("/email-otp/send-verification-otp", { email, type: "sign-in" }, TOO_MANY_CODES);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Could not send a code. Check the address and try again.");
      return false;
    }
    setWait(RESEND_SECONDS);
    return true;
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const target = safeRedirect(redirect);
    const res = await authFetch<{ url?: string }>("/sign-in/social", {
      provider: "google",
      callbackURL: target,
      errorCallbackURL: `/sign-in?redirect=${encodeURIComponent(target)}`,
    });
    if (!res.ok || !res.data?.url) {
      setError(signInErrorText("google_failed"));
      setPending(false);
      return;
    }
    window.location.assign(res.data.url);
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (await requestCode()) setStep("code");
  }

  async function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await authFetch("/sign-in/email", { email, password });
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Wrong email or password.");
    await router.navigate({ href: safeRedirect(redirect) });
  }

  async function verify(code: string) {
    setPending(true);
    setError(null);
    const res = await authFetch("/sign-in/email-otp", { email, otp: code }, TOO_MANY_CODES);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "That code is not right. Try again.");
    await router.navigate({ href: safeRedirect(redirect) });
  }

  return (
    <AuthCard title={step === "email" ? "Sign in to Relay" : "Check your email"} footer="Access is by invite. Ask your workspace owner.">
      {step === "email" ? (
        <AuthForm onSubmit={usePassword ? signInWithPassword : sendCode}>
          {google ? (
            <>
              <AuthButton type="button" variant="outline" disabled={pending} onClick={() => void signInWithGoogle()}>
                <GoogleMark />
                Continue with Google
              </AuthButton>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
          <AuthField label="Email" id="email" name="email"
            type="email"
            autoComplete="email"
            placeholder="Email address"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)} />
          {usePassword ? (
            <>
              <AuthField label="Password" id="password" name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                required
                maxLength={PASSWORD_MAX}
                value={password}
                onChange={(e) => setPassword(e.target.value)} />
              <AuthButton type="submit" disabled={pending}>
                Continue with password
              </AuthButton>
              <AuthLink to="/forgot-password">
                Forgot password?
              </AuthLink>
            </>
          ) : (
            <AuthButton type="submit" disabled={pending}>
              Continue with email
            </AuthButton>
          )}
          <button
            type="button"
            className={authLink}
            onClick={() => {
              setUsePassword(!usePassword);
              setPassword("");
              setError(null);
            }}
          >
            {usePassword ? "Use an email code instead" : "Sign in with password"}
          </button>
        </AuthForm>
      ) : (
        <AuthForm
          onSubmit={(event) => {
            event.preventDefault();
            verify(otp);
          }}
        >
          <AuthText>
            Enter the 6-digit code we sent to <span className="text-foreground">{email}</span>.
          </AuthText>
          <InputOTP autoFocus maxLength={6} pattern="digits" value={otp} onChange={setOtp} onComplete={verify} aria-label="Sign-in code">
            <InputOTPGroup className="w-full">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="h-11 flex-1 bg-background text-base" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <AuthButton type="submit" disabled={pending || otp.length !== 6}>
            Sign in
          </AuthButton>
          <AuthButton type="button" variant="outline" disabled={pending || wait > 0} onClick={() => void requestCode()}>
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </AuthButton>
          <AuthButton
            type="button"
            variant="ghost"
            onClick={() => {
              setStep("email");
              setOtp("");
              setError(null);
            }}
          >
            Use another email
          </AuthButton>
        </AuthForm>
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
