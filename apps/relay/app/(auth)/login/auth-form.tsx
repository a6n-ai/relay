"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { emailSchema } from "@foundry/commons";
import { CodeOtp } from "@foundry/auth-ui";
import { authClient, signIn } from "@/lib/auth/client";
import { Button } from "@foundry/ui/button";
import { Card, CardContent } from "@foundry/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";

type Mode = "email-otp" | "password";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("email-otp");
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            {mode === "email-otp" ? (
              <EmailOtpPanel onUsePassword={() => setMode("password")} />
            ) : (
              <PasswordPanel onUseEmailOtp={() => setMode("email-otp")} />
            )}
          </div>
          <div className="bg-muted text-muted-foreground relative hidden flex-col items-center justify-center gap-2 p-8 md:flex">
            <span className="text-foreground text-2xl font-bold">Relay</span>
            <p className="text-balance text-center text-sm">
              Operator console for tenants, sending domains, and the notification outbox.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const passwordSchema = z.object({
  identifier: emailSchema,
  password: z.string().min(1, "Password is required"),
});

function PasswordPanel({ onUseEmailOtp }: { onUseEmailOtp: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { identifier: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof passwordSchema>) {
    setError(null);
    try {
      const result = await signIn.email({ email: values.identifier, password: values.password });
      if (result?.error) {
        setError("Invalid credentials");
        return;
      }
    } catch {
      setError("Invalid credentials");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-balance">Sign in to Relay</p>
          </div>
          <FormField
            control={form.control}
            name="identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="ops@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center">
                  <FormLabel>Password</FormLabel>
                  <Link href="/forgot-password" className="ml-auto text-sm underline-offset-2 hover:underline">
                    Forgot your password?
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                    >
                      {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            Sign in
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onUseEmailOtp}>
            Email me a sign-in code instead
          </Button>
        </div>
      </form>
    </Form>
  );
}

const otpEmailSchema = z.object({ email: emailSchema });
const otpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });

function EmailOtpPanel({ onUsePassword }: { onUsePassword: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const emailForm = useForm<z.infer<typeof otpEmailSchema>>({
    resolver: zodResolver(otpEmailSchema),
    defaultValues: { email: "" },
  });
  const codeForm = useForm<z.infer<typeof otpCodeSchema>>({
    resolver: zodResolver(otpCodeSchema),
    defaultValues: { code: "" },
  });

  async function sendCode(values: z.infer<typeof otpEmailSchema>) {
    setError(null);
    await authClient.emailOtp.sendVerificationOtp({ email: values.email, type: "sign-in" });
    setEmail(values.email);
    setStep("code");
  }

  async function verify(values: z.infer<typeof otpCodeSchema>) {
    setError(null);
    const result = await signIn.emailOtp({ email, otp: values.code });
    if (result?.error) {
      setError("Invalid or expired code.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground text-balance">
          {step === "email" ? "Sign in with a code sent to your email" : `Enter the code we emailed to ${email}`}
        </p>
      </div>
      {step === "email" ? (
        <Form {...emailForm}>
          <form key="email" onSubmit={emailForm.handleSubmit(sendCode)} className="flex flex-col gap-4">
            <FormField control={emailForm.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="ops@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={emailForm.formState.isSubmitting}>
              Email me a code
            </Button>
          </form>
        </Form>
      ) : (
        <Form {...codeForm}>
          <form key="code" onSubmit={codeForm.handleSubmit(verify)} className="flex flex-col gap-4">
            <FormField
              control={codeForm.control}
              name="code"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Verification code</FormLabel>
                  <FormControl>
                    <CodeOtp
                      value={field.value}
                      onChange={field.onChange}
                      onComplete={() => codeForm.handleSubmit(verify)()}
                      aria-invalid={!!fieldState.error}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>Sign in</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("email"); setError(null); }}>
              Use a different email
            </Button>
          </form>
        </Form>
      )}
      <Button type="button" variant="ghost" className="w-full" onClick={onUsePassword}>
        Sign in with a password instead
      </Button>
    </div>
  );
}
