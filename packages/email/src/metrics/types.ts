export interface CampaignTotals { delivered?: number; opened?: number; clicked?: number }

export interface EmailMetricsProvider {
  campaignTotals(campaignId: string, range: { start: Date; end: Date }): Promise<CampaignTotals>;
}
