import { awsConfigFromEnv, createAwsClient, encodePathSegment, type AwsConfig } from "@foundry/cloud";
import {
  EMAIL_EVENT_TYPES,
  type EmailEventRouting,
  type EmailEventSettingsProvider,
  type EmailEventType,
  type EmailStream,
} from "./types";

const BUDGET = { retries: 1, timeoutMs: 10_000 };
const DAY = 86400;

const toSes = (t: EmailEventType) => t.toUpperCase();
const fromSes = (s: string): EmailEventType | undefined => {
  const t = s.toLowerCase();
  return (EMAIL_EVENT_TYPES as readonly string[]).includes(t) ? (t as EmailEventType) : undefined;
};

const VOLUME_METRICS: [EmailEventType, string][] = [
  ["send", "Send"], ["delivery", "Delivery"], ["delivery_delay", "DeliveryDelay"],
  ["open", "Open"], ["click", "Click"], ["bounce", "Bounce"],
  ["complaint", "Complaint"], ["reject", "Reject"], ["rendering_failure", "RenderingFailure"],
];

interface SesDestination {
  Name: string;
  Enabled?: boolean;
  MatchingEventTypes?: string[];
  SnsDestination?: unknown;
  CloudWatchDestination?: unknown;
  [k: string]: unknown;
}

type Routing = { webhook: EmailEventType[]; counts?: EmailEventType[] };

export function normalizeRouting(stream: EmailStream, r: Routing): Routing {
  if (stream.kind === "untracked") {
    for (const t of [...r.webhook, ...(r.counts ?? [])]) {
      if (t === "open" || t === "click") throw new Error(`${t} events cannot be routed on an untracked stream`);
    }
  }
  const webhook = [...new Set<EmailEventType>(["bounce", "complaint", ...r.webhook])];
  return r.counts ? { webhook, counts: [...new Set(r.counts)] } : { webhook };
}

function pickDestination(dests: SesDestination[], kind: "sns" | "cloudwatch", configSet: string): SesDestination | undefined {
  const matches = dests.filter((d) => (kind === "sns" ? d.SnsDestination : d.CloudWatchDestination));
  if (matches.length > 1) {
    throw new Error(`Configuration set ${configSet} has ${matches.length} ${kind} destinations (${matches.map((d) => d.Name).join(", ")}); expected one`);
  }
  if (!matches[0] && kind === "sns") {
    throw new Error(`No SNS destination on configuration set ${configSet}; bounce and complaint suppression needs one`);
  }
  return matches[0];
}

export function sesEventSettings(opts: AwsConfig = {}): EmailEventSettingsProvider {
  const env = awsConfigFromEnv();
  const config = { region: opts.region ?? env.region, credentials: opts.credentials ?? env.credentials, fetch: opts.fetch };
  const ses = createAwsClient("ses", config);
  const cloudwatch = createAwsClient("monitoring", config);

  const base = (stream: EmailStream) =>
    `https://email.${ses.region}.amazonaws.com/v2/email/configuration-sets/${encodePathSegment(stream.configSet)}/event-destinations`;

  async function list(stream: EmailStream): Promise<SesDestination[]> {
    const out = await ses.json<{ EventDestinations?: SesDestination[] }>(base(stream), { method: "GET", ...BUDGET });
    return out?.EventDestinations ?? [];
  }

  async function put(stream: EmailStream, dest: SesDestination, types: string[]) {
    const { Name, ...rest } = dest;
    await ses.json(`${base(stream)}/${encodePathSegment(Name)}`, {
      method: "PUT",
      json: { EventDestination: { ...rest, MatchingEventTypes: types } },
      ...BUDGET,
    });
  }

  // Unrecognised SES types (e.g. ones SES adds later) are not editable here, so they must survive a save.
  const merge = (existing: string[] | undefined, next: EmailEventType[]) => [
    ...next.map(toSes),
    ...(existing ?? []).filter((s) => !fromSes(s)),
  ];

  return {
    async getRouting(stream): Promise<EmailEventRouting> {
      const dests = await list(stream);
      const known = (d?: SesDestination) => (d?.MatchingEventTypes ?? []).map(fromSes).filter((t): t is EmailEventType => !!t);
      const snsDest = pickDestination(dests, "sns", stream.configSet);
      const cwDest = pickDestination(dests, "cloudwatch", stream.configSet);
      return { webhook: known(snsDest), counts: cwDest ? known(cwDest) : null };
    },

    async setRouting(stream, routing) {
      const r = normalizeRouting(stream, routing);
      const dests = await list(stream);
      const snsDest = pickDestination(dests, "sns", stream.configSet)!;
      const cwDest = pickDestination(dests, "cloudwatch", stream.configSet);
      if (r.counts && !cwDest) throw new Error(`No CloudWatch destination on configuration set ${stream.configSet}`);
      await put(stream, snsDest, merge(snsDest.MatchingEventTypes, r.webhook));
      if (r.counts && cwDest) await put(stream, cwDest, merge(cwDest.MatchingEventTypes, r.counts));
    },

    // Per-configuration-set series exist only when the CloudWatch destination carries a
    // `ses:configuration-set` dimension (MESSAGE_TAG source); without it the sums are 0.
    async eventVolume(stream, days) {
      const end = new Date();
      const start = new Date(end.getTime() - days * DAY * 1000);
      const out = await cloudwatch.json<{ MetricDataResults?: { Id: string; Values?: number[] }[] }>(
        `https://monitoring.${cloudwatch.region}.amazonaws.com/`,
        {
          method: "POST",
          headers: {
            "x-amz-target": "GraniteServiceVersion20100801.GetMetricData",
            "content-type": "application/x-amz-json-1.0",
          },
          json: {
            StartTime: Math.floor(start.getTime() / 1000),
            EndTime: Math.floor(end.getTime() / 1000),
            MetricDataQueries: VOLUME_METRICS.map(([Id, MetricName]) => ({
              Id,
              MetricStat: {
                Metric: {
                  Namespace: "AWS/SES",
                  MetricName,
                  Dimensions: [{ Name: "ses:configuration-set", Value: stream.configSet }],
                },
                Period: DAY,
                Stat: "Sum",
              },
            })),
          },
          ...BUDGET,
        },
      );
      const totals: Partial<Record<EmailEventType, number>> = {};
      for (const r of out?.MetricDataResults ?? []) {
        const t = fromSes(r.Id);
        if (t) totals[t] = (r.Values ?? []).reduce((a, b) => a + b, 0);
      }
      return totals;
    },
  };
}
