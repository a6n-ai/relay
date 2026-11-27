import { useRouter } from "@tanstack/react-router";
import { authFetch } from "./lib/auth-fetch";

export function useSignOut() {
  const router = useRouter();
  return async () => {
    await authFetch("/sign-out", {});
    await router.navigate({ to: "/sign-in" });
  };
}
