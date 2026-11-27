import { env } from "cloudflare:test";
import { AwsError } from "@foundry/cloud";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySesTransport } from "../src/core/ses";
import type { Env } from "../src/env";
import { pickInviteMailer, pickMailer } from "../src/auth/mailers";

const sesEnv = env as Env;
const rejection = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: Error) => e,
  );

beforeEach(() => {
  memorySesTransport.reset();
});

describe("system mail through SES", () => {
  it("sends the sign-in code as a transactional, untagged mail from the system sender", async () => {
    await pickMailer("ses", sesEnv).send("a@x.com", "123456", "sign-in");

    expect(memorySesTransport.sent).toHaveLength(1);
    const [mail] = memorySesTransport.sent;
    expect(mail).toMatchObject({
      to: "a@x.com",
      from: "no-reply@relay.a6n.ai",
      fromName: "Relay",
      region: "ap-south-1",
      stream: "transactional",
      subject: "Your Relay sign-in code",
    });
    expect(mail.text).toContain("123456");
    expect(mail.text).toContain("It expires in 10 minutes.");
    expect(mail.html).toBe(
      "<p>Your Relay sign-in code is <strong>123456</strong>. It expires in 10 minutes. If you did not ask for it, ignore this email.</p>",
    );
    expect(mail.tags).toBeUndefined();
  });

  it("sends the invite link as a transactional, untagged mail", async () => {
    await pickInviteMailer("ses", sesEnv).send("a@x.com", { id: "inv_abc", role: "member" });

    expect(memorySesTransport.sent).toHaveLength(1);
    const [mail] = memorySesTransport.sent;
    expect(mail).toMatchObject({
      to: "a@x.com",
      region: "ap-south-1",
      stream: "transactional",
      subject: "You're invited to a Relay workspace",
    });
    expect(mail.text).toContain("http://localhost/invite/inv_abc");
    expect(mail.text).toContain("as member");
    expect(mail.html).toContain('<a href="http://localhost/invite/inv_abc">');
    expect(mail.tags).toBeUndefined();
  });

  it("rejects both mailers when the system sender is unset", async () => {
    const noFrom = { ...sesEnv, SYSTEM_FROM_EMAIL: undefined } as Env;
    const noRegion = { ...sesEnv, SYSTEM_SES_REGION: undefined } as Env;

    await expect(pickMailer("ses", noFrom).send("a@x.com", "123456", "sign-in")).rejects.toThrow(
      "system mail not configured",
    );
    await expect(pickInviteMailer("ses", noRegion).send("a@x.com", { id: "inv_abc", role: "member" })).rejects.toThrow(
      "system mail not configured",
    );
    expect(memorySesTransport.sent).toHaveLength(0);
  });

  it("logs nothing that carries the code, the link or the full address", async () => {
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    try {
      await pickMailer("ses", sesEnv).send("a@x.com", "123456", "sign-in");
      await pickInviteMailer("ses", sesEnv).send("a@x.com", { id: "inv_abc", role: "member" });
    } finally {
      spy.mockRestore();
    }
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain("123456");
    expect(logged).not.toContain("inv_abc");
    expect(logged).not.toContain("a@x.com");
  });

  it("keeps the recipient out of a failed send's error and console output", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      memorySesTransport.failNext(new Error("Email address is not verified: bob@example.com"));
      const plain = await rejection(pickMailer("ses", sesEnv).send("bob@example.com", "123456", "sign-in"));
      expect(plain.message).toBe("system mail failed");

      memorySesTransport.failNext(new AwsError("MessageRejected", "Email address is not verified: bob@example.com", { status: 400 }));
      const aws = await rejection(pickMailer("ses", sesEnv).send("bob@example.com", "123456", "sign-in"));
      expect(aws.message).toBe("system mail failed: MessageRejected/400");

      expect(JSON.stringify([plain.message, aws.message, errors.mock.calls])).not.toContain("@");
    } finally {
      errors.mockRestore();
    }
  });
});
