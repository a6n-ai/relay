import { describe, expect, it, vi } from "vitest";
import { normalizeRouting, sesEventSettings } from "./ses-event-settings";
import type { EmailStream } from "./types";

const credentials = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };
const stream: EmailStream = { id: "tracked", label: "Tracked", configSet: "app-tracked", kind: "tracked" };
const untracked: EmailStream = { ...stream, id: "untracked", configSet: "app-untracked", kind: "untracked" };

const sns = (types: string[]) => ({
  Name: "sns", Enabled: true, MatchingEventTypes: types,
  SnsDestination: { TopicArn: "arn:aws:sns:us-east-1:1:feedback" },
});
const cw = (types: string[]) => ({
  Name: "cw", Enabled: true, MatchingEventTypes: types,
  CloudWatchDestination: { DimensionConfigurations: [{ DimensionName: "ses:configuration-set", DimensionValueSource: "MESSAGE_TAG", DefaultDimensionValue: "x" }] },
});

function setup(responses: unknown[]) {
  const reqs: { method: string; url: string; json: any }[] = [];
  let i = 0;
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const req = input as Request;
    const text = await req.clone().text();
    reqs.push({ method: req.method, url: req.url, json: text ? JSON.parse(text) : undefined });
    return Response.json(responses[i++] ?? {});
  });
  const provider = sesEventSettings({ region: "us-east-1", credentials, fetch: fetchFn as unknown as typeof fetch });
  return { provider, reqs };
}
const puts = <T extends { method: string }>(reqs: T[]) => reqs.filter((r) => r.method === "PUT");

describe("sesEventSettings", () => {
  it("getRouting maps UPPER_SNAKE to EmailEventType", async () => {
    const { provider, reqs } = setup([{
      EventDestinations: [
        sns(["BOUNCE", "COMPLAINT", "DELIVERY"]),
        cw(["DELIVERY", "OPEN", "CLICK", "DELIVERY_DELAY", "REJECT", "RENDERING_FAILURE"]),
      ],
    }]);
    expect(await provider.getRouting(stream)).toEqual({
      webhook: ["bounce", "complaint", "delivery"],
      counts: ["delivery", "open", "click", "delivery_delay", "reject", "rendering_failure"],
    });
    expect(reqs[0].method).toBe("GET");
    expect(reqs[0].url).toBe("https://email.us-east-1.amazonaws.com/v2/email/configuration-sets/app-tracked/event-destinations");
  });

  it("getRouting counts null when no CloudWatch destination", async () => {
    const { provider } = setup([{ EventDestinations: [sns(["BOUNCE"])] }]);
    expect((await provider.getRouting(stream)).counts).toBeNull();
  });

  it("setRouting PUTs only the matching destination with new MatchingEventTypes and keeps SnsDestination.TopicArn", async () => {
    const { provider, reqs } = setup([{ EventDestinations: [sns(["BOUNCE", "COMPLAINT"]), cw(["SEND"])] }, {}]);
    await provider.setRouting(stream, { webhook: ["bounce", "complaint", "delivery"] });
    expect(puts(reqs)).toHaveLength(1);
    expect(puts(reqs)[0].url).toBe("https://email.us-east-1.amazonaws.com/v2/email/configuration-sets/app-tracked/event-destinations/sns");
    expect(puts(reqs)[0].json).toEqual({
      EventDestination: {
        Enabled: true,
        MatchingEventTypes: ["BOUNCE", "COMPLAINT", "DELIVERY"],
        SnsDestination: { TopicArn: "arn:aws:sns:us-east-1:1:feedback" },
      },
    });
  });

  it("setRouting updates the counts destination when counts given", async () => {
    const { provider, reqs } = setup([{ EventDestinations: [sns(["BOUNCE", "COMPLAINT"]), cw(["SEND"])] }, {}, {}]);
    await provider.setRouting(stream, { webhook: [], counts: ["open"] });
    const cwPut = puts(reqs).find((r) => r.url.endsWith("/cw"))!;
    expect(cwPut.json.EventDestination.MatchingEventTypes).toEqual(["OPEN"]);
    expect(cwPut.json.EventDestination.CloudWatchDestination).toEqual(cw([]).CloudWatchDestination);
  });

  it("setRouting writes delivery_delay and rendering_failure as UPPER_SNAKE", async () => {
    const { provider, reqs } = setup([{ EventDestinations: [sns([]), cw([])] }, {}, {}]);
    await provider.setRouting(stream, { webhook: [], counts: ["delivery_delay", "rendering_failure"] });
    const cwPut = puts(reqs).find((r) => r.url.endsWith("/cw"))!;
    expect(cwPut.json.EventDestination.MatchingEventTypes).toEqual(["DELIVERY_DELAY", "RENDERING_FAILURE"]);
  });

  it.each([
    ["two SNS", [sns([]), { ...sns([]), Name: "sns2" }], /sns destinations \(sns, sns2\)/],
    ["two CloudWatch", [sns([]), cw([]), { ...cw([]), Name: "cw2" }], /cloudwatch destinations \(cw, cw2\)/],
    ["no SNS", [cw([])], /No SNS destination/],
  ])("ambiguous or missing destinations (%s) reject in get and set with no PUT", async (_n, dests, msg) => {
    const g = setup([{ EventDestinations: dests }]);
    await expect(g.provider.getRouting(stream)).rejects.toThrow(msg);
    const s = setup([{ EventDestinations: dests }]);
    await expect(s.provider.setRouting(stream, { webhook: ["delivery"] })).rejects.toThrow(msg);
    expect(puts(s.reqs)).toHaveLength(0);
  });

  it("setRouting forces bounce and complaint into webhook", async () => {
    const { provider, reqs } = setup([{ EventDestinations: [sns([])] }, {}]);
    await provider.setRouting(stream, { webhook: ["delivery"] });
    expect(puts(reqs)[0].json.EventDestination.MatchingEventTypes).toEqual(["BOUNCE", "COMPLAINT", "DELIVERY"]);
  });

  it("setRouting throws for open/click on untracked stream and makes no request", async () => {
    const { provider, reqs } = setup([]);
    await expect(provider.setRouting(untracked, { webhook: ["open"] })).rejects.toThrow(/untracked/);
    await expect(provider.setRouting(untracked, { webhook: [], counts: ["click"] })).rejects.toThrow(/untracked/);
    expect(reqs).toHaveLength(0);
  });

  it("setRouting with counts on a stream without CW destination throws, no PUT", async () => {
    const { provider, reqs } = setup([{ EventDestinations: [sns([])] }]);
    await expect(provider.setRouting(stream, { webhook: [], counts: ["delivery"] })).rejects.toThrow(/CloudWatch/);
    expect(puts(reqs)).toHaveLength(0);
  });

  it("unknown SES event type in the existing destination is kept on save", async () => {
    const { provider, reqs } = setup([{ EventDestinations: [sns(["BOUNCE", "SUBSCRIPTION", "FOO"])] }, {}]);
    await provider.setRouting(stream, { webhook: ["delivery"] });
    expect(puts(reqs)[0].json.EventDestination.MatchingEventTypes).toEqual(["BOUNCE", "COMPLAINT", "DELIVERY", "FOO"]);
  });

  it("eventVolume sums daily values per metric", async () => {
    const { provider, reqs } = setup([{
      MetricDataResults: [
        { Id: "send", Values: [1, 2, 3] },
        { Id: "bounce", Values: [4] },
        { Id: "rendering_failure", Values: [] },
      ],
    }]);
    const out = await provider.eventVolume(stream, 7);
    expect(out).toEqual({ send: 6, bounce: 4, rendering_failure: 0 });
    const q = reqs[0].json.MetricDataQueries;
    expect(q).toHaveLength(9);
    expect(q[0].MetricStat.Metric.Dimensions).toEqual([{ Name: "ses:configuration-set", Value: "app-tracked" }]);
    expect(q[0].MetricStat).toMatchObject({ Period: 86400, Stat: "Sum" });
  });
});

describe("normalizeRouting", () => {
  it("dedupes and puts bounce/complaint first", () => {
    expect(normalizeRouting(stream, { webhook: ["delivery", "bounce", "delivery"] }).webhook).toEqual(["bounce", "complaint", "delivery"]);
  });
});

describe("normalizeRouting strict entries", () => {
  it.each([["OPEN"], ["Delivery"], [1]])("rejects %s without case folding", (bad) => {
    expect(() => normalizeRouting(untracked, { webhook: [bad as never] })).toThrow(/Unknown event type/);
    expect(() => normalizeRouting(stream, { webhook: [], counts: [bad as never] })).toThrow(/Unknown event type/);
  });
  it("sends no request for an invalid entry", async () => {
    const { provider, reqs } = setup([]);
    await expect(provider.setRouting(untracked, { webhook: ["OPEN" as never] })).rejects.toThrow();
    expect(reqs).toHaveLength(0);
  });
});
