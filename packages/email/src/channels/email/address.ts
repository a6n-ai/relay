import type { EmailAddress } from "./types";

/** RFC2047 encoding skipped — add when a sender name needs non-ASCII. */
export function formatAddress({ email, name }: EmailAddress): string {
  return name ? `${name} <${email}>` : email;
}
