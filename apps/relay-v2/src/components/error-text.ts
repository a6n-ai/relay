const FALLBACK = "Something went wrong. Try again.";

// Keys are the fixed messages the server sends. A Map, so a message like "constructor" cannot reach Object.prototype.
const COPY = new Map<string, string>([
  ["forbidden", "Your role can't do this in this workspace."],
  ["workspace suspended", "This workspace is suspended, so changes are paused."],
  ["no workspace", "Pick or create a workspace first."],
  ["not a member", "You are not a member of this workspace."],
  ["not found", "That item no longer exists. Refresh and try again."],
  ["cross-origin write", "This request was blocked. Reload the page and try again."],
  ["unauthorized", "Your session has ended. Sign in again."],
  ["invalid input", "Some details are missing or not valid. Check the form and try again."],
  ["invalid cursor", "This page link is out of date. Open Messages again."],
  ["invalid slug", "Use lowercase letters, numbers and hyphens for the slug."],
  ["slug taken", "That slug is already used in this workspace."],
  ["invalid domain", "Enter a domain like example.com."],
  ["invalid address", "Enter a valid email address."],
  ["invalid quota", "Quota must be a whole number, 0 or more."],
  ["unknown region", "That sending region is not available."],
  ["address must use one of your domains", "Add the domain first, then create addresses on it."],
  ["address already exists", "That address is already set up."],
  ["domain claimed", "That domain is already used by another workspace."],
  ["domain registered", "That domain is already registered and cannot be added here."],
  ["domain not verified", "Verify the domain's DNS records before using it for a mailbox address."],
  ["domain limit reached", "This workspace has reached its sending domain limit."],
  ["invite limit reached", "This workspace has reached its daily invite limit. Try again tomorrow."],
  ["this invite is for another email", "This invite was sent to a different email address."],
  ["self-serve workspaces have one app", "This workspace already has its app."],
  ["team not found", "That team no longer exists."],
]);

// The server's fixed copy is mapped to plain words; anything unknown (a network failure, a 500) gets the fallback, never the raw text.
export function errorText(err: unknown, fallback = FALLBACK): string {
  const message = err instanceof Error ? err.message : "";
  if (message.startsWith("invite ")) return "This invite is no longer open.";
  return COPY.get(message) ?? fallback;
}
