export const AUDIENCE_BINDINGS = ["TIFFIN_AUDIENCE"] as const;
export const HOOK_PAGE_LIMIT = 500;

/**
 * Hook protocol (v1).
 * Request: { type: "audience.page", appId, workspaceId, campaignId, audience: string | null, cursor: string | null, limit: 500, sentAt }. `audience` is the campaign's opaque `audience_query`, at most 1,000 characters. The body is signed in `x-relay-signature`; `sentAt` (epoch ms) is also sent as `x-relay-timestamp`.
 * Response: { recipients: HookRecipient[]; nextCursor: string | null }, with at most 500 recipients.
 * `HookRecipient` is { email, firstName?, lastName?, consent: "express" | "implied", consentAt: number, data?: Record<string, string> }. `data` holds at most 10 keys matching `/^[a-z0-9_]{1,40}$/`, and each value is at most 200 characters.
 * A recipient that fails validation is skipped and counted in the step output as `invalid`. A page that is not JSON, or has a bad shape, fails the run.
 */
export type AudienceRequest = {
  type: "audience.page";
  appId: string;
  workspaceId: string;
  campaignId: string;
  audience: string | null;
  cursor: string | null;
  limit: number;
  sentAt: number;
};

export type HookRecipient = {
  email: string;
  firstName?: string;
  lastName?: string;
  consent: "express" | "implied";
  consentAt: number;
  data?: Record<string, string>;
};

export type AudiencePage = { recipients: HookRecipient[]; nextCursor: string | null; invalid: number };

export type HookCall =
  | { kind: "https"; url: string; body: string; headers: Record<string, string> }
  | { kind: "binding"; binding: (typeof AUDIENCE_BINDINGS)[number]; request: AudienceRequest };
