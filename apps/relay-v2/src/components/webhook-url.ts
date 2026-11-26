// The field shows the host after a fixed "https://"; the stored and sent value is always the full URL.
export const WEBHOOK_URL_PREFIX = "https://";

export function webhookUrlFromInput(typed: string): string {
  const rest = typed.replace(/^https:\/\//i, "");
  return rest ? WEBHOOK_URL_PREFIX + rest : "";
}

export function webhookUrlForInput(url: string): string {
  return url.replace(/^https:\/\//i, "");
}
