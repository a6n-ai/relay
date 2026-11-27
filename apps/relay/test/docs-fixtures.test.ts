import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { campaignCreateInput, campaignPatch, listInput, membersImportInput, listPatch, templateInput, templatePatch } from "../src/services/schemas";
import { hookInputSchema } from "../src/core/audience-hook";
import { memberInput } from "../src/shared/schemas";
import { sendBody, templateSendSchema } from "../src/shared/schemas";
import { webhookInputSchema, webhookPatchSchema } from "../src/core/webhooks";
import { scheduleBody } from "../src/routes/api/v1/campaigns.$id.$action";

type Endpoint = { route: string; title: string; method: string; path: string; schema?: string; body?: unknown };

// A fixture's `schema` names an entry here; the entry fixes the route file that parses with that exact export.
const SCHEMAS: Record<string, { route: string; schema: ZodType }> = {
  send: { route: "messages.ts", schema: sendBody },
  sendTemplate: { route: "templates.send.ts", schema: templateSendSchema },
  templateCreate: { route: "templates.ts", schema: templateInput },
  templatePatch: { route: "templates.$id.ts", schema: templatePatch },
  listCreate: { route: "lists.ts", schema: listInput },
  listPatch: { route: "lists.$id.ts", schema: listPatch },
  member: { route: "lists.$id.members.ts", schema: memberInput },
  membersImport: { route: "lists.$id.import.ts", schema: membersImportInput },
  campaignCreate: { route: "campaigns.ts", schema: campaignCreateInput },
  campaignPatch: { route: "campaigns.$id.ts", schema: campaignPatch },
  campaignSchedule: { route: "campaigns.$id.$action.ts", schema: scheduleBody },
  webhookCreate: { route: "webhooks.ts", schema: webhookInputSchema },
  webhookPatch: { route: "webhooks.$id.ts", schema: webhookPatchSchema },
  audienceHook: { route: "audience-hook.ts", schema: hookInputSchema },
};

const files = import.meta.glob<Endpoint[]>("../../relay-docs/src/fixtures/*.json", { eager: true, import: "default" });
const endpoints = Object.entries(files).flatMap(([file, list]) => list.map((e) => ({ file, ...e })));
const pages = Object.values(import.meta.glob<string>("../../relay-docs/src/content/docs/docs/api/*.mdx", { eager: true, query: "?raw", import: "default" })).join("\n");
const rendered = new Set(
  [...pages.replace(/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g, "").matchAll(/<Endpoint file="([^"]+)" title=("(?:[^"\\]|\\.)*") \/>/g)].map((m) => `${m[1]}|${JSON.parse(m[2])}`),
);
const routeFiles = Object.keys(import.meta.glob("../src/routes/api/v1/*.ts")).map((p) => p.split("/").pop()!);

describe("docs fixtures", () => {
  it("finds fixtures and route files", () => {
    expect(endpoints.length).toBeGreaterThan(0);
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(endpoints.map((e) => [`${e.method} ${e.path} (${e.title})`, e] as const))("%s parses against its route schema", (_name, e) => {
    if (!e.schema) {
      expect(e.body, "a fixture with a body names its schema").toBeUndefined();
      return;
    }
    const entry = SCHEMAS[e.schema];
    expect(entry, `unknown schema ${e.schema}`).toBeDefined();
    expect(e.route, `schema ${e.schema} belongs to ${entry.route}`).toBe(entry.route);
    const result = entry.schema.safeParse(e.body);
    expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
  });

  it.each(routeFiles)("route file %s has a fixture", (route) => {
    expect(endpoints.some((e) => e.route === route)).toBe(true);
  });

  it("names only route files that exist", () => {
    expect(endpoints.filter((e) => !routeFiles.includes(e.route)).map((e) => e.route)).toEqual([]);
  });

  it("has no two fixtures with the same title in one file", () => {
    const keys = endpoints.map((e) => `${e.file}|${e.title}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it.each(endpoints.map((e) => [e.title, e] as const))("%s is rendered on an API page", (_name, e) => {
    expect(rendered.has(`${e.file.split("/").pop()!.replace(".json", "")}|${e.title}`)).toBe(true);
  });

  it("never mentions an internal secret name", () => {
    expect(JSON.stringify(endpoints)).not.toMatch(/_SECRET/);
  });
});
