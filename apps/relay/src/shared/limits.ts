export const DAY_MS = 86_400_000;

export const ID_MAX = 64;
// A webhook create or patch body: a URL, a few events and a name.
export const WEBHOOK_BODY_MAX = 65_536;
export const NAME_MAX = 80;
export const TEMPLATE_NAME_MAX = 120;
export const EMAIL_MAX = 254;
export const URL_MAX = 2048;
export const SUBJECT_MAX = 300;
export const MEMBERS_IMPORT_MAX = 1000;
export const CSV_IMPORT_MAX_BYTES = 2_000_000;
export const BODY_MAX = 500_000;
export const CONSENT_NOTE_MAX = 500;
export const AUDIENCE_QUERY_MAX = 1000;
export const AUTOMATION_DELAY_MAX = 720;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PAGE_SIZE = 50;

export const DEFAULT_MONTHLY_QUOTA = 10_000;
export const MAX_MONTHLY_QUOTA = 100_000_000;
export const MAX_INVITES_PER_DAY = 10_000;

export const WORKSPACE_STATUSES = ["active", "suspended"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

// The one reading of a workspace status: suspended pauses writes and sending, nothing else.
export const isSuspended = (status: string | null | undefined) => status === "suspended";
