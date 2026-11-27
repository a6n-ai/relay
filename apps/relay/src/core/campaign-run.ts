export type CampaignRunParams = { workspaceId: string; campaignId: string; runSeq: number; at: number };

export const CHUNK_SIZE = 500;
export const ENQUEUE_BATCH = 100;
