import nextDynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

const LoginForm = nextDynamic(() => import("./auth-form").then((m) => ({ default: m.AuthForm })), {
  loading: () => <div className="bg-card min-h-80 w-full border border-border" aria-hidden />,
});

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");
  return <LoginForm />;
}
