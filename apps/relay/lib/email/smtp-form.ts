export type SmtpSettingsInput = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  spfInclude: string | null;
  fromEmail: string | null;
  fromName: string | null;
};

export function parseSmtpSettingsForm(
  formData: FormData,
  existingPassword?: string | null,
): { error: string } | { value: SmtpSettingsInput } {
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? "587");
  const username = String(formData.get("username") ?? "").trim() || null;
  const passwordIn = String(formData.get("password") ?? "");
  const spfInclude = String(formData.get("spfInclude") ?? "").trim() || null;
  const fromEmail = String(formData.get("fromEmail") ?? "").trim() || null;
  const fromName = String(formData.get("fromName") ?? "").trim() || null;
  const secure = String(formData.get("secure") ?? "") === "on" || String(formData.get("secure") ?? "") === "true";
  if (!host) return { error: "Mail server is required" };
  return {
    value: {
      host,
      port: Number.isFinite(port) ? port : 587,
      secure,
      username,
      password: passwordIn || existingPassword || null,
      spfInclude,
      fromEmail,
      fromName,
    },
  };
}
