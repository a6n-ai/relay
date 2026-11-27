export type CampaignRunParams = { workspaceId: string; campaignId: string; runSeq: number; at: number };

export const CHUNK_SIZE = 500;
// More recipients than this pauses the run as too_many_recipients.
export const MAX_RUN_RECIPIENTS = 200_000;
export const ENQUEUE_BATCH = 100;
