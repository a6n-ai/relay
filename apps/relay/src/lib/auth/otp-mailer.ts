import { maskEmails, normalizeEmail } from "../../core/mask-emails";

export type OtpMailer = { send(email: string, otp: string, type: string): Promise<void> };

export const consoleOtpMailer: OtpMailer = {
  async send(email, _otp, type) {
    console.log(`[otp] ${type} sent to ${maskEmails(email)}`);
  },
};

const lastByEmail = new Map<string, string>();
const noticesByEmail = new Map<string, number>();

export const memoryOtpMailer: OtpMailer & { lastOtp(email: string): string | undefined; noticeCount(email: string): number } = {
  async send(email, otp, type) {
    const key = normalizeEmail(email);
    if (type === "password-changed") noticesByEmail.set(key, (noticesByEmail.get(key) ?? 0) + 1);
    else lastByEmail.set(key, otp);
  },
  noticeCount(email: string): number {
    return noticesByEmail.get(normalizeEmail(email)) ?? 0;
  },
  lastOtp(email: string): string | undefined {
    return lastByEmail.get(normalizeEmail(email));
  },
};
