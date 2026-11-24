import type { Env } from "../env";

export const DEFAULT_SES_RATE = 14;

// Read untyped: the binding name depends on the region, so Env cannot list every one.
export function sesSendRate(env: Env, region: string): number {
  const key = `SES_MAX_SEND_RATE_${region.toUpperCase().replace(/-/g, "_")}`;
  const rate = Number((env as unknown as Record<string, unknown>)[key]);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SES_RATE;
}
