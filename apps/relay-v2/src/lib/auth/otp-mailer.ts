export type OtpMailer = { send(email: string, otp: string, type: string): Promise<void> };

export const consoleOtpMailer: OtpMailer = {
  async send(email, _otp, type) {
    const masked = email.replace(/^[^@]*/, (local) => `${local.charAt(0)}***`);
    console.log(`[otp] ${type} sent to ${masked}`);
  },
};

const lastByEmail = new Map<string, string>();

export const memoryOtpMailer: OtpMailer & { lastOtp(email: string): string | undefined } = {
  async send(email, otp) {
    lastByEmail.set(email.trim().toLowerCase(), otp);
  },
  lastOtp(email: string): string | undefined {
    return lastByEmail.get(email.trim().toLowerCase());
  },
};
