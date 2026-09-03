/** HTTP catalog for integrators. Operator JSON uses a console session; send uses an app key. */

export type PublicHttpMethod = "GET" | "POST" | "DELETE";

export type PublicApiOperation = {
  method: PublicHttpMethod;
  path: string;
  operationId: string;
  summary: string;
};

const problem = {
  type: "object",
  required: ["title", "status"],
  properties: {
    title: { type: "string" },
    status: { type: "integer" },
  },
} as const;

const json = (schema: unknown, example?: unknown) => ({
  content: {
    "application/json": {
      schema,
      ...(example !== undefined ? { example } : {}),
    },
  },
});

const session = [{ cookieAuth: [] }];
const key = [{ bearerAuth: [] }];

function op(
  operationId: string,
  summary: string,
  extra: Record<string, unknown>,
) {
  return { operationId, summary, ...extra };
}

export function relayOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Relay API",
      version: "1.0.0",
      description:
        "App send uses Bearer keys (`POST /v1/messages`). Console resources (apps, mailbox, campaigns, people lists, automations, tags, team, templates, status updates) use the operator session cookie. OpenAPI here is the source for Scalar, Swagger UI, and later SDKs.",
    },
    servers: [
      { url: "http://localhost:3010", description: "Local Relay" },
      { url: "https://relay.example", description: "Example production host" },
    ],
    tags: [
      { name: "Discovery" },
      { name: "Messages" },
      { name: "Apps" },
      { name: "Mailbox" },
      { name: "Campaigns" },
      { name: "People" },
      { name: "Automations" },
      { name: "Tags" },
      { name: "Team" },
      { name: "Templates" },
      { name: "Status updates" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "App API key. Copied once when the app is created.",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Operator console session. Sign in at /login, then call from the same browser or with the cookie.",
        },
      },
      schemas: {
        Problem: problem,
        Accepted: {
          type: "object",
          required: ["accepted"],
          properties: { accepted: { type: "boolean", enum: [true] } },
        },
        MessageTo: {
          type: "object",
          properties: {
            userId: { type: "string" },
            email: { type: "string", format: "email" },
            phone: { type: "string" },
          },
        },
        CreateMessage: {
          type: "object",
          required: ["title", "body", "to"],
          properties: {
            title: { type: "string", minLength: 1 },
            body: { type: "string", minLength: 1 },
            to: { $ref: "#/components/schemas/MessageTo" },
            event: { type: "string" },
            kind: { type: "string", enum: ["transactional", "marketing"] },
            channels: {
              type: "array",
              items: { type: "string", enum: ["email", "in_app", "sms", "whatsapp"] },
            },
            href: { type: "string" },
            vars: { type: "object", additionalProperties: true },
            idempotencyKey: { type: "string" },
            sendAt: { type: "integer", description: "Unix ms" },
          },
        },
        PublicId: {
          type: "object",
          properties: { publicId: { type: "string" } },
        },
      },
    },
    paths: {
      "/v1": {
        get: op("listPublicApi", "List docs URLs and operations", {
          tags: ["Discovery"],
          security: [],
          responses: { "200": { description: "Catalog", ...json({ type: "object" }) } },
        }),
      },
      "/v1/openapi.json": {
        get: op("getOpenApi", "OpenAPI 3.1 document", {
          tags: ["Discovery"],
          security: [],
          responses: { "200": { description: "OpenAPI", ...json({ type: "object" }) } },
        }),
      },
      "/v1/messages": {
        post: op("createMessage", "Queue a notification", {
          tags: ["Messages"],
          security: key,
          requestBody: {
            required: true,
            ...json(
              { $ref: "#/components/schemas/CreateMessage" },
              {
                event: "order.paid",
                title: "Order paid",
                body: "Thanks — we have your order.",
                to: { email: "ops@example.com" },
                channels: ["email"],
              },
            ),
          },
          responses: {
            "202": { description: "Queued", ...json({ $ref: "#/components/schemas/Accepted" }) },
            "400": { description: "Invalid body", ...json({ $ref: "#/components/schemas/Problem" }) },
            "401": { description: "Unknown key", ...json({ $ref: "#/components/schemas/Problem" }) },
            "403": { description: "Channel not on this key", ...json({ $ref: "#/components/schemas/Problem" }) },
            "429": { description: "Monthly limit", ...json({ $ref: "#/components/schemas/Problem" }) },
          },
        }),
      },
      "/api/notifications/apps": {
        get: op("listApps", "List apps", {
          tags: ["Apps"],
          security: session,
          responses: { "200": { description: "Apps", ...json({ type: "array", items: { type: "object" } }) } },
        }),
        post: op("createApp", "Create an app and return its API secret once", {
          tags: ["Apps"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["name", "slug"],
              properties: {
                name: { type: "string" },
                slug: { type: "string" },
                mailingCountry: { type: "string" },
                physicalAddress: { type: "string" },
                monthlyMessageQuota: { type: "integer" },
              },
            }),
          },
          responses: {
            "201": { description: "Created; copy secret now", ...json({ type: "object" }) },
            "400": { description: "Invalid", ...json({ $ref: "#/components/schemas/Problem" }) },
          },
        }),
      },
      "/api/notifications/mailbox": {
        get: op("listMailbox", "List mailbox conversations (no HTML bodies)", {
          tags: ["Mailbox"],
          security: session,
          responses: { "200": { description: "Letters", ...json({ type: "array" }) } },
        }),
      },
      "/api/notifications/mailbox/{id}": {
        get: op("readMailboxLetter", "Read a letter including HTML", {
          tags: ["Mailbox"],
          security: session,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Letter", ...json({ type: "object" }) },
            "404": { description: "Missing", ...json({ $ref: "#/components/schemas/Problem" }) },
          },
        }),
      },
      "/api/notifications/mailbox/send": {
        post: op("sendMailboxLetter", "Compose or reply from Mailbox", {
          tags: ["Mailbox"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["to", "subject", "text", "fromId"],
              properties: {
                to: { type: "string", format: "email" },
                subject: { type: "string" },
                text: { type: "string" },
                fromId: { type: "string", description: "`operator` or a verified From public id" },
                replyToId: { type: "string" },
              },
            }),
          },
          responses: { "200": { description: "Sent", ...json({ type: "object" }) } },
        }),
      },
      "/api/notifications/campaigns": {
        get: op("listCampaigns", "List campaigns", {
          tags: ["Campaigns"],
          security: session,
          responses: { "200": { description: "Campaigns", ...json({ type: "array" }) } },
        }),
        post: op("createCampaign", "Create a campaign for an app", {
          tags: ["Campaigns"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["tenantPublicId", "name", "channels"],
              properties: {
                tenantPublicId: { type: "string", description: "App public id" },
                name: { type: "string" },
                channels: { type: "array", items: { type: "string" } },
                audience: { type: "object" },
                scheduledAt: { type: "integer", nullable: true },
              },
            }),
          },
          responses: { "201": { description: "Created", ...json({ $ref: "#/components/schemas/PublicId" }) } },
        }),
      },
      "/api/notifications/campaigns/{id}/content": {
        post: op("saveCampaignContent", "Save campaign copy", {
          tags: ["Campaigns"],
          security: session,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["channel", "locale", "subject"],
              properties: {
                channel: { type: "string" },
                locale: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" },
                html: { type: "string" },
                text: { type: "string" },
                providerTemplateId: { type: "string" },
              },
            }),
          },
          responses: { "200": { description: "Saved", ...json({ type: "object" }) } },
        }),
      },
      "/api/notifications/campaigns/{id}/send": {
        post: op("sendCampaign", "Queue a campaign to its audience", {
          tags: ["Campaigns"],
          security: session,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["confirmedCount"],
              properties: { confirmedCount: { type: "integer" } },
            }),
          },
          responses: { "200": { description: "Queued count", ...json({ type: "object" }) } },
        }),
      },
      "/api/notifications/contact-lists": {
        get: op("listPeopleLists", "List people lists", {
          tags: ["People"],
          security: session,
          responses: { "200": { description: "Lists", ...json({ type: "array" }) } },
        }),
        post: op("createPeopleList", "Create a people list", {
          tags: ["People"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["name", "consentSource", "consentAt"],
              properties: {
                name: { type: "string" },
                consentSource: { type: "string", enum: ["purchase", "express_optin", "event_signup", "import_other"] },
                consentAt: { type: "integer" },
                consentNote: { type: "string" },
              },
            }),
          },
          responses: { "201": { description: "Created", ...json({ $ref: "#/components/schemas/PublicId" }) } },
        }),
      },
      "/api/notifications/contact-lists/{id}/import": {
        post: op("importPeopleList", "Import CSV members", {
          tags: ["People"],
          security: session,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: { type: "string", format: "binary" },
                    mapping: { type: "string", description: "JSON: email, phone, name column names" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Imported", ...json({ type: "object" }) } },
        }),
      },
      "/api/notifications/automations": {
        get: op("listAutomations", "List automations", {
          tags: ["Automations"],
          security: session,
          responses: { "200": { description: "Rules", ...json({ type: "array" }) } },
        }),
        post: op("createAutomation", "Create an automation", {
          tags: ["Automations"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["tenantPublicId", "name", "triggerEvent", "listPublicId"],
              properties: {
                tenantPublicId: { type: "string", description: "App public id" },
                name: { type: "string" },
                triggerEvent: { type: "string" },
                listPublicId: { type: "string" },
              },
            }),
          },
          responses: { "201": { description: "Created", ...json({ $ref: "#/components/schemas/PublicId" }) } },
        }),
      },
      "/api/notifications/tags": {
        get: op("listTags", "List app message tags", {
          tags: ["Tags"],
          security: session,
          responses: { "200": { description: "Tags", ...json({ type: "array" }) } },
        }),
        post: op("createTag", "Add a tag to an app", {
          tags: ["Tags"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["tenantPublicId", "label"],
              properties: {
                tenantPublicId: { type: "string", description: "App public id" },
                label: { type: "string" },
              },
            }),
          },
          responses: { "200": { description: "Saved", ...json({ type: "object" }) } },
        }),
        delete: op("deleteTag", "Remove a tag from an app", {
          tags: ["Tags"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["tenantPublicId", "slug"],
              properties: {
                tenantPublicId: { type: "string" },
                slug: { type: "string" },
              },
            }),
          },
          responses: { "200": { description: "Removed", ...json({ type: "object" }) } },
        }),
      },
      "/api/notifications/team": {
        get: op("listTeam", "List people who can sign in to the console", {
          tags: ["Team"],
          security: session,
          responses: { "200": { description: "Team", ...json({ type: "array" }) } },
        }),
      },
      "/api/notifications/templates": {
        get: op("listTemplates", "List templates", {
          tags: ["Templates"],
          security: session,
          responses: { "200": { description: "Templates", ...json({ type: "array" }) } },
        }),
        post: op("saveTemplate", "Create or update a template", {
          tags: ["Templates"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["tenantPublicId", "event", "channel", "subject"],
              properties: {
                tenantPublicId: { type: "string" },
                event: { type: "string" },
                channel: { type: "string", enum: ["email", "in_app", "sms", "whatsapp"] },
                locale: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" },
                html: { type: "string" },
                text: { type: "string" },
                providerTemplateId: { type: "string" },
                enabled: { type: "boolean" },
              },
            }),
          },
          responses: { "200": { description: "Saved", ...json({ type: "object" }) } },
        }),
      },
      "/api/notifications/webhooks": {
        get: op("listStatusUpdates", "List status-update endpoints", {
          tags: ["Status updates"],
          security: session,
          responses: { "200": { description: "Endpoints", ...json({ type: "array" }) } },
        }),
        post: op("createStatusUpdate", "Add a status-update URL", {
          tags: ["Status updates"],
          security: session,
          requestBody: {
            required: true,
            ...json({
              type: "object",
              required: ["tenantPublicId", "url", "events"],
              properties: {
                tenantPublicId: { type: "string" },
                url: { type: "string", format: "uri" },
                events: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["message.queued", "message.sent", "message.failed", "message.bounced", "message.complained"],
                  },
                },
              },
            }),
          },
          responses: { "201": { description: "Created", ...json({ type: "object" }) } },
        }),
      },
    },
  };
}

export const PUBLIC_API_OPERATIONS: PublicApiOperation[] = (() => {
  const doc = relayOpenApiDocument();
  const out: PublicApiOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!item || typeof item !== "object") continue;
    for (const method of ["get", "post", "delete"] as const) {
      const spec = (item as Record<string, { operationId?: string; summary?: string } | undefined>)[method];
      if (!spec?.operationId) continue;
      out.push({
        method: method.toUpperCase() as PublicHttpMethod,
        path,
        operationId: spec.operationId,
        summary: spec.summary ?? "",
      });
    }
  }
  return out;
})();

export function publicApiCatalog(basePath = "") {
  return {
    docs: `${basePath}/docs`,
    apiDocs: `${basePath}/docs/api`,
    swagger: `${basePath}/docs/api/swagger`,
    openapi: `${basePath}/v1/openapi.json`,
    operations: PUBLIC_API_OPERATIONS,
  };
}
