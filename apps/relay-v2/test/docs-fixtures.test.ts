import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";
import { campaignPatch, listInput, templateInput, templatePatch } from "../src/console/schemas";
import { hookInputSchema } from "../src/core/audience-hook";
import { campaignCreateInput } from "../src/core/campaign-scope";
import {
  importCampaignsSchema,
  importListsSchema,
  importMessagesSchema,
  importSuppressionsSchema,
  importTemplatesSchema,
} from "../src/core/imports";
import { membersImportInput } from "../src/core/lists";
import { memberInput } from "../src/core/member-input";
import { sendInputSchema, templateSendSchema } from "../src/core/send-input";
import { webhookInputSchema, webhookPatchSchema } from "../src/core/webhooks";
import { scheduleBody } from "../src/routes/api/v1/campaigns.$id.$action";

type Endpoint = { route: string; title: string; method: string; path: string; schema?: string; body?: unknown };

// The same schema each route parses with. A route that changes its schema must change its name here and its fixture.
const SCHEMAS: Record<string, ZodType> = {
  send: sendInputSchema.omit({ appId: true, campaignId: true }),
  sendTemplate: templateSendSchema,
  templateCreate: templateInput,
  templatePatch,
  listCreate: listInput,
  listPatch: listInput.partial(),
  member: memberInput,
  membersImport: membersImportInput,
  campaignCreate: campaignCreateInput,
  campaignPatch,
  campaignSchedule: scheduleBody,
  webhookCreate: webhookInputSchema,
  webhookPatch: webhookPatchSchema,
  audienceHook: hookInputSchema,
  importLists: z.object({ rows: importListsSchema }),
  importTemplates: z.object({ rows: importTemplatesSchema }),
  importCampaigns: z.object({ rows: importCampaignsSchema }),
  importMessages: z.object({ rows: importMessagesSchema }),
  importSuppressions: z.object({ rows: importSuppressionsSchema }),
};

const files = import.meta.glob<Endpoint[]>("../../relay-docs/src/fixtures/*.json", { eager: true, import: "default" });
const endpoints = Object.entries(files).flatMap(([file, list]) => list.map((e) => ({ file, ...e })));
const pages = Object.values(import.meta.glob<string>("../../relay-docs/src/content/docs/docs/api/*.mdx", { eager: true, query: "?raw", import: "default" })).join("\n");
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
    const schema = SCHEMAS[e.schema];
    expect(schema, `unknown schema ${e.schema}`).toBeDefined();
    const result = schema.safeParse(e.body);
    expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
  });

  it.each(routeFiles)("route file %s has a fixture", (route) => {
    expect(endpoints.some((e) => e.route === route)).toBe(true);
  });

  it("names only route files that exist", () => {
    expect(endpoints.filter((e) => !routeFiles.includes(e.route)).map((e) => e.route)).toEqual([]);
  });

  it.each(endpoints.map((e) => [e.title, e] as const))("%s is rendered on an API page", (_name, e) => {
    expect(pages).toContain(`<Endpoint file="${e.file.split("/").pop()!.replace(".json", "")}" title=${JSON.stringify(e.title)} />`);
  });

  it("never mentions an internal secret name", () => {
    expect(JSON.stringify(endpoints)).not.toMatch(/_SECRET/);
  });
});
