export function applySmtpRowToEnv(row: {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
}) {
  process.env.EMAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = row.host;
  process.env.SMTP_PORT = String(row.port);
  process.env.SMTP_SECURE = row.secure ? "true" : "false";
  if (row.username) process.env.SMTP_USER = row.username;
  if (row.password) process.env.SMTP_PASS = row.password;
}
