import { Button } from "@foundry/ui/button";
import { useRouter } from "@tanstack/react-router";

// Used on the app shell and on /no-workspace, so a member with no workspace can still sign out.
export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await router.navigate({ to: "/sign-in" });
  }
  return (
    <Button variant="ghost" size="sm" onClick={signOut}>
      Sign out
    </Button>
  );
}
