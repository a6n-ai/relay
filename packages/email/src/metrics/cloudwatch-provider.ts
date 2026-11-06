import { createAwsClient, awsConfigFromEnv, type AwsConfig } from "@foundry/aws";
import type { CampaignTotals, EmailMetricsProvider } from "./types";

interface GetMetricDataResponse {
  NextToken?: string;
  MetricDataResults?: { Id: string; Values?: number[] }[];
}

const METRICS = [
  ["delivered", "Delivery"],
  ["opened", "Open"],
  ["clicked", "Click"],
] as const;

export function cloudWatchSesMetrics(opts: AwsConfig = {}): EmailMetricsProvider {
  const env = awsConfigFromEnv();
  const aws = createAwsClient("monitoring", {
    region: opts.region ?? env.region,
    credentials: opts.credentials ?? env.credentials,
    fetch: opts.fetch,
  });

  return {
    async campaignTotals(campaignId, { start, end }) {
      const totals: CampaignTotals = {};
      let nextToken: string | undefined;
      do {
        const out: GetMetricDataResponse = await aws.json(`https://monitoring.${aws.region}.amazonaws.com/`, {
          method: "POST",
          headers: {
            "x-amz-target": "GraniteServiceVersion20100801.GetMetricData",
            "content-type": "application/x-amz-json-1.0",
          },
          json: {
            // JSON protocol takes epoch seconds.
            StartTime: Math.floor(start.getTime() / 1000),
            EndTime: Math.floor(end.getTime() / 1000),
            NextToken: nextToken,
            MetricDataQueries: METRICS.map(([Id, MetricName]) => ({
              Id,
              MetricStat: {
                Metric: { Namespace: "AWS/SES", MetricName, Dimensions: [{ Name: "campaign", Value: campaignId }] },
                Period: 86400,
                Stat: "Sum",
              },
            })),
          },
          retries: 1,
          timeoutMs: 10_000,
        });
        for (const r of out?.MetricDataResults ?? []) {
          const key = METRICS.find(([id]) => id === r.Id)?.[0];
          if (key) totals[key] = (totals[key] ?? 0) + (r.Values ?? []).reduce((a, b) => a + b, 0);
        }
        nextToken = out?.NextToken;
      } while (nextToken);
      return totals;
    },
  };
}
