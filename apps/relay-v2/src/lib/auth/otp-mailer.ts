export type OtpMailer = { send(email: string, otp: string, type: string): Promise<void> };

export const consoleOtpMailer: OtpMailer = {
  async send(email, otp, type) {
    console.log(`[otp] ${type} for ${email}: ${otp}`);
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
