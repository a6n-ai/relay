import { useRouter } from "@tanstack/react-router";

export function useSignOut() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await router.navigate({ to: "/sign-in" });
  };
}
