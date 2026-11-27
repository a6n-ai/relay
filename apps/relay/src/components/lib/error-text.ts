import { copyOf } from "../../shared/errors";

const FALLBACK = "Something went wrong. Try again.";

// The server's fixed copy is mapped to plain words; anything unknown (a network failure, a 500) gets the fallback, never the raw text.
export function errorText(err: unknown, fallback = FALLBACK): string {
  const message = err instanceof Error ? err.message : "";
  return copyOf(message) ?? fallback;
}
