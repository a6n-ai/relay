import { copyOf } from "../shared/errors";

const FALLBACK = "Something went wrong. Try again.";

// Paused campaigns store a code on the row, not an Error, so the report maps it through the same table.
export const reasonText = (code: string | null): string | null => (code ? (copyOf(code) ?? FALLBACK) : null);

export const isNotFound = (err: unknown): boolean => err instanceof Error && err.message === "not found";

// The server's fixed copy is mapped to plain words; anything unknown (a network failure, a 500) gets the fallback, never the raw text.
export function errorText(err: unknown, fallback = FALLBACK): string {
  const message = err instanceof Error ? err.message : "";
  if (message.startsWith("invite ")) return "This invite is no longer open.";
  return copyOf(message) ?? fallback;
}
