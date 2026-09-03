import { describe, expect, it } from "vitest";
import { PUBLIC_API_OPERATIONS, publicApiCatalog, relayOpenApiDocument } from "./openapi";

describe("relayOpenApiDocument", () => {
  it("covers every live public operationId", () => {
    const doc = relayOpenApiDocument();
    const ids = new Set<string>();
    for (const path of Object.values(doc.paths)) {
      for (const op of Object.values(path)) {
        if (op && typeof op === "object" && "operationId" in op && typeof op.operationId === "string") {
          ids.add(op.operationId);
        }
      }
    }
    for (const op of PUBLIC_API_OPERATIONS) {
      expect(ids.has(op.operationId)).toBe(true);
      expect(doc.paths[op.path as keyof typeof doc.paths]).toBeDefined();
    }
    expect(doc.openapi).toBe("3.1.0");
  });
});

describe("publicApiCatalog", () => {
  it("points integrators at docs and OpenAPI without a dashboard session", () => {
    expect(publicApiCatalog()).toMatchObject({
      docs: "/docs",
      openapi: "/v1/openapi.json",
    });
    expect(publicApiCatalog().operations.map((o) => o.path)).toEqual(
      expect.arrayContaining([
        "/v1/messages",
        "/api/notifications/mailbox",
        "/api/notifications/campaigns",
        "/api/notifications/contact-lists",
        "/api/notifications/automations",
        "/api/notifications/apps",
        "/api/notifications/tags",
        "/api/notifications/team",
      ]),
    );
  });
});
