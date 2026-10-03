import { describe, expect, it, vi } from "vitest";
import { buildHandlers, resolveRecipientAddress } from "./handlers";

/**
 * Minimal fake db: dispatches `.select().from(table).where()` by table
 * identity, since buildHandlers only ever awaits that chain directly (no
 * further chaining) for both the user lookup and the template lookup.
 */
function fakeDb(rowsByTable: Map<object, unknown[]>) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (_cols: unknown) => ({
      from: (table: object) => ({
        where: async (_cond: unknown) => rowsByTable.get(table) ?? [],
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("buildHandlers — email — marketing footer on event-template rows", () => {
  const usersTable = { locale: "locale-col" };
  const templateTable = {};
  const userRow = { email: "customer@example.test", phone: null, locale: "en" };
  const templateRows = [
    {
      channel: "email",
      locale: "en",
      subject: "Finish your order",
      body: null,
      html: "<p>You left items in your cart</p>",
      text: "You left items in your cart",
      providerTemplateId: null,
      enabled: true,
    },
  ];

  function setup(senderEmail?: string) {
    const db = fakeDb(
      new Map<object, unknown[]>([
        [usersTable, [userRow]],
        [templateTable, templateRows],
      ]),
    );
    const send = vi.fn().mockResolvedValue({ providerMessageId: "pid" });
    const handlers = buildHandlers({
      db,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tables: { notificationTemplate: templateTable } as any,
      users: { table: usersTable, columns: { id: "id-col", email: "email-col" } },
      providers: { email: { send } },
      broadcast: vi.fn(),
      campaigns: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tables: {} as any,
        unsubscribe: { baseUrl: "https://recover.test", secret: "shh" },
        sender: { name: "Puchkaman", postalAddress: "123 Main St", email: senderEmail },
      },
    });
    return { handlers, send };
  }

  function row(kind: string) {
    return {
      recipientId: 7n,
      recipientEmail: null,
      recipientPhone: null,
      campaignId: null,
      event: "cart_abandoned",
      kind,
      payload: { href: null, vars: {} },
    };
  }

  it("appends the unsubscribe footer to a marketing-kind event email", async () => {
    const { handlers, send } = setup();
    await handlers.email!(row("marketing"));
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent.html).toContain("Unsubscribe");
    expect(sent.html).toContain("Puchkaman");
    expect(sent.text).toContain("Unsubscribe: https://recover.test/unsubscribe");
  });

  it("does not append a footer to a transactional-kind event email", async () => {
    const { handlers, send } = setup();
    await handlers.email!(row("transactional"));
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent.html).not.toContain("Unsubscribe");
    expect(sent.headers).toBeUndefined();
  });

  it("sends marketing From the campaign sender email; transactional keeps the provider default", async () => {
    const { handlers, send } = setup("hello@example.test");
    await handlers.email!(row("marketing"));
    await handlers.email!(row("transactional"));
    expect(send.mock.calls[0][0].from).toEqual({ email: "hello@example.test", name: "Puchkaman" });
    expect(send.mock.calls[1][0].from).toBeUndefined();
  });

  it("leaves marketing on the provider default when no campaign sender email is set", async () => {
    const { handlers, send } = setup();
    await handlers.email!(row("marketing"));
    expect(send.mock.calls[0][0].from).toBeUndefined();
  });
});

describe("buildHandlers — email — campaign attachments", () => {
  it("fetches each attachment by url and forwards base64 content to the provider", async () => {
    const usersTable = { locale: "locale-col" };
    const campaignContentTable = {};
    const userRow = { email: "customer@example.test", phone: null, locale: "en" };
    const contentRows = [
      {
        channel: "email",
        locale: "en",
        subject: "Your invoice",
        body: null,
        html: "<p>see attached</p>",
        text: "see attached",
        providerTemplateId: null,
        attachments: [{ filename: "invoice.pdf", url: "https://files.test/invoice.pdf", contentType: "application/pdf" }],
      },
    ];
    const db = fakeDb(
      new Map<object, unknown[]>([
        [usersTable, [userRow]],
        [campaignContentTable, contentRows],
      ]),
    );
    const send = vi.fn().mockResolvedValue({ providerMessageId: "pid" });
    const fetchMock = vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from("pdf-bytes") });
    vi.stubGlobal("fetch", fetchMock);

    const handlers = buildHandlers({
      db,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tables: {} as any,
      users: { table: usersTable, columns: { id: "id-col", email: "email-col" } },
      providers: { email: { send } },
      broadcast: vi.fn(),
      campaigns: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tables: { campaignContent: campaignContentTable, campaign: { systemKey: "sk-col" } } as any,
        unsubscribe: { baseUrl: "https://recover.test", secret: "shh" },
        sender: { name: "Puchkaman", postalAddress: "123 Main St" },
      },
    });

    await handlers.email!({
      recipientId: 7n,
      recipientEmail: null,
      recipientPhone: null,
      campaignId: 42n,
      event: null,
      kind: "marketing",
      payload: { href: null, vars: {} },
    });

    expect(fetchMock).toHaveBeenCalledWith("https://files.test/invoice.pdf");
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent.attachments).toEqual([
      { filename: "invoice.pdf", content: Buffer.from("pdf-bytes").toString("base64"), contentType: "application/pdf" },
    ]);
    vi.unstubAllGlobals();
  });
});

describe("buildHandlers — email — system campaign sender", () => {
  function setup(systemKey: string | null) {
    const usersTable = { locale: "locale-col" };
    const campaignContentTable = {};
    const campaignTable = { systemKey: "sk-col" };
    const db = fakeDb(
      new Map<object, unknown[]>([
        [usersTable, [{ email: "customer@example.test", phone: null, locale: "en" }]],
        [
          campaignContentTable,
          [{ channel: "email", locale: "en", subject: "Pick your meals", body: null, html: "<p>hi</p>", text: "hi", providerTemplateId: null, attachments: [] }],
        ],
        [campaignTable, [{ systemKey }]],
      ]),
    );
    const send = vi.fn().mockResolvedValue({ providerMessageId: "pid" });
    const handlers = buildHandlers({
      db,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tables: {} as any,
      users: { table: usersTable, columns: { id: "id-col", email: "email-col" } },
      providers: { email: { send } },
      broadcast: vi.fn(),
      campaigns: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tables: { campaignContent: campaignContentTable, campaign: campaignTable } as any,
        unsubscribe: { baseUrl: "https://recover.test", secret: "shh" },
        sender: { name: "TiffinGrab", postalAddress: "123 Main St", email: "info@example.test" },
      },
    });
    const row = { recipientId: 7n, recipientEmail: null, recipientPhone: null, campaignId: 42n, event: null, kind: "marketing", payload: { href: null, vars: {} } };
    return { send, run: () => handlers.email!(row) };
  }

  it("keeps the footer but leaves from the transactional default", async () => {
    const { send, run } = setup("menu_reminder");
    await run();
    expect(send.mock.calls[0][0].from).toBeUndefined();
    expect(send.mock.calls[0][0].html).toContain("Unsubscribe");
  });

  it("sets one-click List-Unsubscribe headers pointing at the API route", async () => {
    const { send, run } = setup("menu_reminder");
    await run();
    const h = send.mock.calls[0][0].headers;
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(h["List-Unsubscribe"]).toMatch(/^<https:\/\/recover\.test\/api\/unsubscribe\?address=customer%40example\.test&token=[0-9a-f]+&campaignId=42>$/);
  });

  it("a normal campaign still leaves from the marketing sender", async () => {
    const { send, run } = setup(null);
    await run();
    expect(send.mock.calls[0][0].from).toEqual({ email: "info@example.test", name: "TiffinGrab" });
  });
});

describe("resolveRecipientAddress", () => {
  it("prefers the literal address on the row", async () => {
    const load = vi.fn();
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: "row@x.com", recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "row@x.com", locale: "en" });
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to the user row when no literal address is stored", async () => {
    const load = vi.fn().mockResolvedValue({ email: "user@x.com", phone: null, locale: "fr" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "user@x.com", locale: "fr" });
  });

  it("returns null when neither source has an address", async () => {
    const load = vi.fn().mockResolvedValue({ email: null, phone: null, locale: "en" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toBeNull();
  });

  it("uses the phone column for sms", async () => {
    const got = await resolveRecipientAddress(
      { recipientId: null, recipientEmail: null, recipientPhone: "+14165550134" },
      "sms",
      vi.fn(),
    );
    expect(got).toEqual({ address: "+14165550134", locale: "en" });
  });
});
