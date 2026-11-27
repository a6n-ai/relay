export const DAY_MS = 86_400_000;

export const ID_MAX = 64;
export const NAME_MAX = 80;
export const TEMPLATE_NAME_MAX = 120;
export const EMAIL_MAX = 254;
export const URL_MAX = 2048;
export const SUBJECT_MAX = 300;
export const BODY_MAX = 500_000;
export const CONSENT_NOTE_MAX = 500;
export const AUDIENCE_QUERY_MAX = 1000;
export const AUTOMATION_DELAY_MAX = 720;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PAGE_SIZE = 50;

// Matches the column default in db/core/schema.ts; test/limits.test.ts keeps them equal.
export const DEFAULT_MONTHLY_QUOTA = 10_000;
export const MAX_MONTHLY_QUOTA = 100_000_000;
export const MAX_INVITES_PER_DAY = 10_000;
