import { useRouter } from "@tanstack/react-router";
import { toast } from "@foundry/ui/toast";
import { useState } from "react";
import { errorText } from "./error-text";

type Done<T> = {
  success: string;
  description?: string;
  // Runs after the toast: close the form, navigate, show a secret.
  after?: (result: T) => void | Promise<void>;
  // Refreshes the route's data after `after`. Pass false when `after` navigates away.
  invalidate?: boolean;
};

// The submit handler every form repeats: pending flag, error copy from the server's code, then the success tail.
// `run` never throws, so a form handler can `await run(...)` and stop there. Anything set with `setError` (a validation message) shows in the same slot.
export function useSubmit() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(action: () => Promise<T>, fallback?: string, done?: Done<T>) {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (done) {
        toast.success(done.success, done.description ? { description: done.description } : undefined);
        await done.after?.(result);
        if (done.invalidate !== false) await router.invalidate();
      }
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}
