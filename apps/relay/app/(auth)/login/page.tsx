import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "./auth-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
