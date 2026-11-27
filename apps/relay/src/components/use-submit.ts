import { useState } from "react";
import { errorText } from "./error-text";

// The submit handler every form repeats: pending flag, error copy from the server's code, then `onDone` on success.
// `run` never throws, so a form handler can `await run(...)` and stop there. Anything set with `setError` (a validation message) shows in the same slot.
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, fallback?: string, onDone?: () => void | Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      await onDone?.();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}
