// Client-safe copy of the regions in SES_CONFIG_SETS (core/ses.ts pulls server-only code); a test keeps them equal.
export const SES_REGIONS = ["ap-south-1", "us-east-1"] as const;
export type SesRegion = (typeof SES_REGIONS)[number];
