import { describe, expect, it, vi } from "vitest";
import { cloudWatchSesMetrics } from "./cloudwatch-provider";

const credentials = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };
const range = { start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-11-06T00:00:00Z") };

function fakeFetch(pages: Array<{ body: unknown; status?: number }>) {
  const reqs: { url: string; headers: Headers; json: any }[] = [];
  let i = 0;
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const req = input as Request;
    reqs.push({ url: req.url, headers: req.headers, json: JSON.parse(await req.clone().text()) });
    const page = pages[i++];
    return Response.json(page.body, { status: page.status ?? 200 });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, reqs };
}

const metrics = (fetchFn: typeof fetch) => cloudWatchSesMetrics({ region: "us-east-1", credentials, fetch: fetchFn });

describe("cloudWatchSesMetrics", () => {
  it("queries Delivery/Open/Click for the campaign dimension over AWS JSON 1.0", async () => {
    const { fetchFn, reqs } = fakeFetch([{ body: { MetricDataResults: [] } }]);
    await metrics(fetchFn).campaignTotals("42", range);

    const r = reqs[0];
    expect(r.url).toBe("https://monitoring.us-east-1.amazonaws.com/");
    expect(r.headers.get("x-amz-target")).toBe("GraniteServiceVersion20100801.GetMetricData");
    expect(r.headers.get("content-type")).toBe("application/x-amz-json-1.0");
    expect(r.json.StartTime).toBe(Date.parse("2026-11-01T00:00:00Z") / 1000);
    expect(r.json.EndTime).toBe(Date.parse("2026-11-06T00:00:00Z") / 1000);
    expect(r.json.MetricDataQueries.map((q: any) => [q.Id, q.MetricStat.Metric.MetricName])).toEqual([
      ["delivered", "Delivery"],
      ["opened", "Open"],
      ["clicked", "Click"],
    ]);
    for (const q of r.json.MetricDataQueries) {
      expect(q.MetricStat).toMatchObject({
        Period: 86400,
        Stat: "Sum",
        Metric: { Namespace: "AWS/SES", Dimensions: [{ Name: "campaign", Value: "42" }] },
      });
    }
  });

  it("sums Values per id and follows NextToken", async () => {
    const { fetchFn, reqs } = fakeFetch([
      { body: { NextToken: "t1", MetricDataResults: [{ Id: "delivered", Values: [10, 5] }, { Id: "opened", Values: [3] }] } },
      { body: { MetricDataResults: [{ Id: "delivered", Values: [1] }, { Id: "clicked", Values: [2, 2] }] } },
    ]);
    const totals = await metrics(fetchFn).campaignTotals("42", range);
    expect(totals).toEqual({ delivered: 16, opened: 3, clicked: 4 });
    expect(reqs[0].json.NextToken).toBeUndefined();
    expect(reqs[1].json.NextToken).toBe("t1");
  });

  it("returns {} when there are no results", async () => {
    const { fetchFn } = fakeFetch([{ body: { MetricDataResults: [] } }]);
    expect(await metrics(fetchFn).campaignTotals("42", range)).toEqual({});
  });

  it("rejects on a non-2xx response", async () => {
    const { fetchFn } = fakeFetch([{ body: { __type: "InvalidParameterValue", message: "bad" }, status: 400 }]);
    await expect(metrics(fetchFn).campaignTotals("42", range)).rejects.toThrow();
  });
});
