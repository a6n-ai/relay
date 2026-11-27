import { AppError } from "@foundry/commons/errors";

export type Status = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 503;
type Row = { status: Status; copy?: string; denied?: true };

// Errors thrown inside ClientDO cross Workers RPC, which keeps only the message, so the message string is the code.
// These strings are also stored in campaign.error / message.error and documented in the public API: never rename one.
// A row without `copy` shows the generic fallback in the UI. `denied` marks "you cannot see this here".
export const ERRORS = {
  forbidden: { status: 403, denied: true, copy: "Your role can't do this in this workspace." },
  "workspace suspended": { status: 403, denied: true, copy: "This workspace is suspended, so changes are paused." },
  "no workspace": { status: 403, denied: true, copy: "Pick or create a workspace first." },
  "not a member": { status: 403, denied: true, copy: "You are not a member of this workspace." },
  "not found": { status: 404, copy: "That item no longer exists. Refresh and try again." },
  "cross-origin write": { status: 403, copy: "This request was blocked. Reload the page and try again." },
  unauthorized: { status: 401, copy: "Your session has ended. Sign in again." },
  "password already set": { status: 409, copy: "A password is already set. Use Change password instead." },
  "invalid input": { status: 400, copy: "Some details are missing or not valid. Check the form and try again." },
  "invalid cursor": { status: 400, copy: "This page link has expired. Reload the page." },
  "invalid slug": { status: 400, copy: "Use lowercase letters, numbers and hyphens for the slug." },
  "slug taken": { status: 409, copy: "That slug is already used in this workspace." },
  "slug does not match": { status: 400 },
  "invalid domain": { status: 400, copy: "Enter a domain like example.com." },
  "invalid address": { status: 400, copy: "Enter a valid email address." },
  "invalid quota": { status: 400, copy: "Quota must be a whole number, 0 or more." },
  "unknown region": { status: 400, copy: "That sending region is not available." },
  "address must use one of your domains": { status: 400, copy: "Add the domain first, then create addresses on it." },
  "address already exists": { status: 409, copy: "That address is already set up." },
  "already has access": { status: 409, copy: "That person or team already has access to this address." },
  "domain claimed": { status: 409, copy: "That domain is already used by another workspace." },
  "domain registered": { status: 409, copy: "That domain is already registered and cannot be added here." },
  "domain not verified": { status: 409, copy: "Verify the domain's DNS records before using it for a mailbox address." },
  "domain limit reached": { status: 409, copy: "This workspace has reached its sending domain limit." },
  "domain is protected": { status: 409, copy: "This domain is protected, so it can't be released or deleted here." },
  "domain cannot be released": { status: 409 },
  "domain name does not match": { status: 400, copy: "Type the domain name exactly to confirm the delete." },
  "invite limit reached": { status: 429, copy: "This workspace has reached its daily invite limit. Try again tomorrow." },
  "invite accepted": { status: 409, copy: "This invite is no longer open." },
  "invite rejected": { status: 409, copy: "This invite is no longer open." },
  "invite canceled": { status: 409, copy: "This invite is no longer open." },
  "invite expired": { status: 409, copy: "This invite is no longer open." },
  "this invite is for another email": { status: 403, copy: "This invite was sent to a different email address." },
  "self-serve workspaces have one app": { status: 403, copy: "This workspace already has its app." },
  "team not found": { status: 400, copy: "That team no longer exists." },
  "recipient opted out": { status: 409, copy: "This address opted out of mail, so it can't be removed here." },
  "cannot replay": { status: 409, copy: "This letter is missing its app or address, so it can't be retried. You can still delete it." },
  "address removed": { status: 409, copy: "The address this letter came to was removed, so it can't be retried. You can still delete it." },
  "raw letter missing": { status: 409, copy: "The original letter is no longer stored, so it can't be retried. You can still delete it." },
  "raw mail missing": { status: 409 },
  "delivery not failed": { status: 409, copy: "Only failed deliveries can be retried." },
  "webhook disabled": { status: 409, copy: "Turn this webhook on before retrying its deliveries." },
  "webhooks unavailable": { status: 503, copy: "Webhooks are unavailable right now. Try again later." },
  "webhook key not configured": { status: 503 },
  "missing email column": { status: 400, copy: "The CSV needs an email column in its first row." },
  "too many rows": { status: 400, copy: "Import at most 10,000 contacts at a time." },
  "list in use": { status: 409, copy: "This list is in use, so it can't be deleted." },
  "address suppressed": { status: 409, copy: "This address is suppressed, so it can't be added to a list." },
  "campaign not editable": { status: 409, copy: "Only draft campaigns can be changed. This one has already been scheduled or sent." },
  "campaign not ready": { status: 409 },
  "unknown merge field": { status: 400, copy: "The body uses a merge field that doesn't exist. Check the merge field list." },
  "sender not verified": { status: 400, copy: "Choose a From address on a verified domain." },
  "sender not available": { status: 400 },
  no_default_sender: { status: 422 },
  "body too large": { status: 413 },
  "invalid schedule": { status: 400, copy: "Pick a time within the next year, not in the past." },
  "could not schedule": { status: 503, copy: "The campaign could not be scheduled. Try again in a moment." },
  "campaign not scheduled": { status: 409, copy: "This campaign is no longer scheduled. Refresh to see its current status." },
  "campaign not sending": { status: 409, copy: "This campaign is no longer sending. Refresh to see its current status." },
  "campaign not paused": { status: 409, copy: "This campaign is no longer paused. Refresh to see its current status." },
  "campaign not cancellable": { status: 409, copy: "This campaign can no longer be cancelled. Refresh to see its current status." },
  "could not resume": { status: 503, copy: "The campaign could not be resumed. Try again in a moment." },
  quota_exceeded: { status: 429, copy: "This workspace has used its monthly send limit. Try again next month." },
  sender_not_verified: { status: 422, copy: "Choose a From address on a verified domain." },
  workspace_suspended: { status: 403, copy: "This workspace is suspended, so sending is paused." },
  "unknown list": { status: 400, copy: "That list no longer exists. Refresh and try again." },
  "unknown template": { status: 400, copy: "That template no longer exists. Refresh and try again." },
  too_many_recipients: { status: 409, copy: "This campaign has more recipients than one send allows." },
  run_failed: { status: 500, copy: "Sending hit an error and stopped. Resume to try again." },
  "template event taken": { status: 409, copy: "Another template already handles this event in this locale." },
  "template in use": { status: 409, copy: "An automation uses this template, so it can't be deleted." },
  "template not found": { status: 404, copy: "That template no longer exists. Refresh and try again." },
  "template disabled": { status: 409, copy: "This template is turned off, so it can't be sent." },
  "unsubscribe only on marketing": { status: 400, copy: "This template has an unsubscribe link, so it can only send as marketing mail." },
  "unsubscribe link required": { status: 400 },
  "automation not ready": { status: 409, copy: "This automation isn't ready. Check its list, template, From address and postal address." },
  "automation uses data fields": {
    status: 409,
    copy: "This template uses {{data.*}} fields, which only an app audience fills. Automations send to lists, so remove them.",
  },
  audience_failed: { status: 409, copy: "Your app's audience could not be read." },
  "audience not saved": { status: 409, copy: "Save the audience settings first." },
  "unknown binding": { status: 400, copy: "That app audience connection is not available." },
  "audience hook unavailable": { status: 503, copy: "The app audience service is unavailable right now. Try again later." },
  "hook managed by platform admin": { status: 403, copy: "Relay manages this app audience, so it can't be changed here." },
  "could not create workspace": { status: 400 },
  template_missing: { status: 404 },
  template_disabled: { status: 409 },
  empty_subject: { status: 400 },
  queue_failed: { status: 503 },
  "limits unavailable": { status: 503 },
  "exactly one grantee required": { status: 400 },
  "address does not belong to workspace": { status: 404 },
  "grantee does not belong to workspace": { status: 404 },
  "app does not belong to workspace": { status: 404 },
  "auth refused": { status: 403 },
  "workspace not empty": { status: 409 },
  "rate limited": { status: 429 },
} as const satisfies Record<string, Row>;

export type ErrorCode = keyof typeof ERRORS;

// The message is the code unless a caller passes `message` to carry detail (a joined problem list, an upstream auth message).
export class RelayError extends AppError {
  constructor(
    readonly code: ErrorCode,
    status: Status = ERRORS[code].status,
    message: string = code,
    options?: ErrorOptions,
  ) {
    super(message, status);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export const fail = (code: ErrorCode, status?: Status, message?: string): never => {
  throw new RelayError(code, status, message);
};

// By message, so it also works for an error that crossed Workers RPC. Object.hasOwn keeps "constructor" out.
export function codeOf(err: unknown): ErrorCode | undefined {
  return err instanceof Error && Object.hasOwn(ERRORS, err.message) ? (err.message as ErrorCode) : undefined;
}

// The status a refusal answers with: an AppError carries it, and a ClientDO refusal that crossed RPC as a plain Error whose message is its code.
export function statusOf(err: unknown): Status | undefined {
  if (err instanceof AppError) return err.status as Status;
  const code = codeOf(err);
  return code && ERRORS[code].status;
}

export const copyOf = (code: string | null | undefined): string | undefined => {
  if (!code || !Object.hasOwn(ERRORS, code)) return undefined;
  return (ERRORS[code as ErrorCode] as Row).copy;
};

export const isDenied = (message: string): boolean => Object.hasOwn(ERRORS, message) && "denied" in ERRORS[message as ErrorCode];
