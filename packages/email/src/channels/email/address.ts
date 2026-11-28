import type { EmailAddress } from "./types";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// Words made only of atext and spaces need no quoting (RFC 5322); anything else is quoted.
const PLAIN_NAME = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~ -]+$/;

/** RFC2047 encoding skipped — add when a sender name needs non-ASCII. */
export function formatAddress({ email, name }: EmailAddress): string {
  if (CONTROL.test(email)) throw new Error("Email address contains control characters");
  if (!name) return email;
  if (CONTROL.test(name)) throw new Error("Email display name contains control characters");
  if (PLAIN_NAME.test(name)) return `${name} <${email}>`;
  return `"${name.replace(/[\\"]/g, "\\$&")}" <${email}>`;
}
