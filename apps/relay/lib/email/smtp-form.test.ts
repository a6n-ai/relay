import { describe, expect, it } from "vitest";
import { parseSmtpSettingsForm } from "./smtp-form";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("parseSmtpSettingsForm", () => {
  it("requires a host", () => {
    expect(parseSmtpSettingsForm(form({}))).toEqual({ error: "Mail server is required" });
  });

  it("defaults port 587 and keeps the stored password when the field is blank", () => {
    expect(parseSmtpSettingsForm(form({ host: "smtp.example.com" }), "stored-secret")).toEqual({
      value: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: null,
        password: "stored-secret",
        spfInclude: null,
        fromEmail: null,
        fromName: null,
      },
    });
  });

  it("treats secure=on and an invalid port", () => {
    const parsed = parseSmtpSettingsForm(
      form({
        host: "smtp.example.com",
        port: "not-a-number",
        secure: "on",
        username: "relay",
        password: "pw",
        spfInclude: "amazonses.com",
      }),
    );
    expect(parsed).toEqual({
      value: {
        host: "smtp.example.com",
        port: 587,
        secure: true,
        username: "relay",
        password: "pw",
        spfInclude: "amazonses.com",
        fromEmail: null,
        fromName: null,
      },
    });
  });
});
