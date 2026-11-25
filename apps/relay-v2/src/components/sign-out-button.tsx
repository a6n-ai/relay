import { Button } from "@foundry/ui/button";
import { useRouter } from "@tanstack/react-router";

export function useSignOut() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await router.navigate({ to: "/sign-in" });
  };
}

// Used on /no-workspace, so a member with no workspace can still sign out.
export function SignOutButton() {
  const signOut = useSignOut();
  return (
    <Button variant="ghost" size="sm" onClick={signOut}>
      Sign out
    </Button>
  );
}
