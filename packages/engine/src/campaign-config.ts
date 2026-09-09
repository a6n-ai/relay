import type { CampaignTables } from "./campaign-schema";
import type { HandlerDeps } from "./handlers";

/**
 * Build the campaign footer config `buildHandlers` needs from an app's env.
 *
 * Returns undefined when any of the three footer inputs (secret, postal
 * address, base url) is missing, so a caller can do
 * `campaigns: buildCampaignConfig(tables, process.env, { senderName: "X" })`
 * and get the same fail-closed behavior every app needs: a missing env var
 * stops marketing sends rather than sending a commercial email with no
 * unsubscribe link and no postal address, which is the failure CASL actually
 * penalises. Transactional mail is untouched either way.
 */
export function buildCampaignConfig(
  tables: CampaignTables,
  env: Record<string, string | undefined>,
  defaults: { senderName: string },
): HandlerDeps["campaigns"] {
  const secret = env.UNSUBSCRIBE_SECRET;
  const postalAddress = env.CAMPAIGN_POSTAL_ADDRESS;
  const baseUrl = env.CAMPAIGN_BASE_URL ?? env.SITE_URL;
  if (!secret || !postalAddress || !baseUrl) return undefined;
  return {
    tables,
    unsubscribe: { baseUrl, secret },
    sender: { name: env.CAMPAIGN_SENDER_NAME ?? defaults.senderName, postalAddress },
  };
}
