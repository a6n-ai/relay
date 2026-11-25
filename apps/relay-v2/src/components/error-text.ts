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
  ["invalid cursor", "This page link has expired. Reload the page."],
  ["invalid slug", "Use lowercase letters, numbers and hyphens for the slug."],
  ["slug taken", "That slug is already used in this workspace."],
  ["invalid domain", "Enter a domain like example.com."],
  ["invalid address", "Enter a valid email address."],
  ["invalid quota", "Quota must be a whole number, 0 or more."],
  ["unknown region", "That sending region is not available."],
  ["address must use one of your domains", "Add the domain first, then create addresses on it."],
  ["address already exists", "That address is already set up."],
  ["already has access", "That person or team already has access to this address."],
  ["domain claimed", "That domain is already used by another workspace."],
  ["domain registered", "That domain is already registered and cannot be added here."],
  ["domain not verified", "Verify the domain's DNS records before using it for a mailbox address."],
  ["domain limit reached", "This workspace has reached its sending domain limit."],
  ["invite limit reached", "This workspace has reached its daily invite limit. Try again tomorrow."],
  ["this invite is for another email", "This invite was sent to a different email address."],
  ["self-serve workspaces have one app", "This workspace already has its app."],
  ["team not found", "That team no longer exists."],
  ["recipient opted out", "This address opted out of mail, so it can't be removed here."],
  ["cannot replay", "This letter is missing its app or address, so it can't be retried. You can still delete it."],
  ["address removed", "The address this letter came to was removed, so it can't be retried. You can still delete it."],
  ["raw letter missing", "The original letter is no longer stored, so it can't be retried. You can still delete it."],
  ["delivery not failed", "Only failed deliveries can be retried."],
  ["webhook disabled", "Turn this webhook on before retrying its deliveries."],
  ["webhooks unavailable", "Webhooks are unavailable right now. Try again later."],
  ["missing email column", "The CSV needs an email column in its first row."],
  ["too many rows", "Import at most 10,000 contacts at a time."],
  ["list in use", "This list is in use, so it can't be deleted."],
  ["address suppressed", "This address is suppressed, so it can't be added to a list."],
  ["campaign not editable", "Only draft campaigns can be changed. This one has already been scheduled or sent."],
  ["campaign not ready", "Finish the checklist before scheduling this campaign."],
  ["unknown merge field", "The body uses a merge field that doesn't exist. Check the merge field list."],
  ["sender not verified", "Choose a From address on a verified domain."],
  ["invalid schedule", "Pick a time within the next year, not in the past."],
  ["could not schedule", "The campaign could not be scheduled. Try again in a moment."],
  ["campaign not scheduled", "This campaign is no longer scheduled. Refresh to see its current status."],
  ["campaign not sending", "This campaign is no longer sending. Refresh to see its current status."],
  ["campaign not paused", "This campaign is no longer paused. Refresh to see its current status."],
  ["campaign not cancellable", "This campaign can no longer be cancelled. Refresh to see its current status."],
  ["could not resume", "The campaign could not be resumed. Try again in a moment."],
  ["quota_exceeded", "This workspace has used its monthly send limit. Try again next month."],
  ["sender_not_verified", "Choose a From address on a verified domain."],
  ["workspace_suspended", "This workspace is suspended, so sending is paused."],
  ["unknown list", "That list no longer exists. Refresh and try again."],
  ["too_many_recipients", "This campaign has more recipients than one send allows."],
  ["run_failed", "Sending hit an error and stopped. Resume to try again."],
  ["template event taken", "Another template already handles this event in this locale."],
  ["template in use", "An automation uses this template, so it can't be deleted."],
  ["template not found", "That template no longer exists. Refresh and try again."],
  ["template disabled", "This template is turned off, so it can't be sent."],
  ["unsubscribe only on marketing", "This template has an unsubscribe link, so it can only send as marketing mail."],
  ["automation not ready", "This automation isn't ready. Check its list, template, From address and postal address."],
  ["automation uses data fields", "This template uses {{data.*}} fields, which only an app audience fills. Automations send to lists, so remove them."],
  ["audience_failed", "Your app's audience could not be read."],
  ["unknown binding", "That app audience connection is not available."],
  ["audience hook unavailable", "The app audience service is unavailable right now. Try again later."],
  ["hook managed by platform admin", "Relay manages this app audience, so it can't be changed here."],
]);

// Paused campaigns store a code on the row, not an Error, so the report maps it through the same COPY.
export const reasonText = (code: string | null): string | null => (code ? (COPY.get(code) ?? FALLBACK) : null);

export const isNotFound = (err: unknown): boolean => err instanceof Error && err.message === "not found";

// The server's fixed copy is mapped to plain words; anything unknown (a network failure, a 500) gets the fallback, never the raw text.
export function errorText(err: unknown, fallback = FALLBACK): string {
  const message = err instanceof Error ? err.message : "";
  if (message.startsWith("invite ")) return "This invite is no longer open.";
  return COPY.get(message) ?? fallback;
}
