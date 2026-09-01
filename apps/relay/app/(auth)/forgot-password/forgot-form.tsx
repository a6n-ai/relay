"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ForgotPasswordForm } from "@foundry/auth-ui";
import { authClient } from "@/lib/auth/client";
import { Card, CardContent } from "@foundry/ui/card";

export function ForgotForm() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            <ForgotPasswordForm
              onSendEmailOtp={(email) => authClient.emailOtp.requestPasswordReset({ email })}
              onResetWithEmailOtp={({ email, otp, password }) =>
                authClient.emailOtp.resetPassword({ email, otp, password })
              }
              onSuccess={() => router.push("/login")}
            />
            <div className="mt-6 text-center text-sm">
              <Link href="/login" className="underline underline-offset-4">
                Back to sign in
              </Link>
            </div>
          </div>
          <div className="bg-muted text-muted-foreground relative hidden flex-col items-center justify-center gap-2 p-8 md:flex">
            <span className="text-foreground text-2xl font-bold">Relay</span>
            <p className="text-balance text-center text-sm">Reset your operator password with a 6-digit email code.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
