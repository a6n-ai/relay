import type { AudienceRequest } from "./core/audience-hook";
import type { CampaignRunParams } from "./core/campaign-workflow";
import type { SesEventJob } from "./core/ses-events";
import type { ClientDO } from "./do/client-do";

// finalize: the SES send already happened; the job only records the SES id and never calls SES.
export type SendJob =
  | { kind?: "send"; workspaceId: string; messageId: string }
  | { kind: "finalize"; workspaceId: string; messageId: string; sesMessageId: string };

export type WebhookJob = { workspaceId: string; deliveryId: string };
export type InboundJob = {
  workspaceId: string;
  appId: string;
  addressId: string;
  rawKey: string;
  envelopeFrom: string;
  envelopeTo: string;
  authResults: string | null;
  receivedAt: number;
};

// Global so that cloudflare:workers `env` is typed with the same bindings.
declare global {
  namespace Cloudflare {
    interface Env {
      SECURITY_DB: D1Database;
      CORE_DB: D1Database;
      CLIENT: DurableObjectNamespace<ClientDO>;
      MAIL: R2Bucket;
      SEND: Queue<SendJob>;
      SES_EVENTS: Queue<SesEventJob>;
      INBOUND: Queue<InboundJob>;
      WEBHOOKS: Queue<WebhookJob>;
      CAMPAIGNS: Workflow<CampaignRunParams>;
      OPS: Workflow<import("./core/ops-workflow").OpsParams>;
      API_LIMIT: RateLimit;
      BETTER_AUTH_SECRET: string;
      BETTER_AUTH_URL: string;
      OTP_MAILER?: "memory" | "console" | "ses";
      INVITE_MAILER?: "memory" | "console" | "ses";
      DEV_OTP_PEEK?: "1";
      SEED_SECRET?: string;
      INTERNAL_SECRET?: string;
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
      SES_EVENT_TOPIC_ARNS?: string;
      SYSTEM_FROM_EMAIL?: string;
      SYSTEM_FROM_NAME?: string;
      SYSTEM_SES_REGION?: string;
      SES_TRANSPORT?: "memory";
      // Comma-separated; new sending_domain rows for these are inserted protected. Defaults to a6n.ai,tiffingrab.ca.
      PROTECTED_DOMAINS?: string;
      WEBHOOK_SECRET_KEY?: string;
      UNSUBSCRIBE_SECRET?: string;
      // Bound in Phase 6; optional so 5b deploys without the target Worker.
      TIFFIN_AUDIENCE?: { resolveAudience(request: AudienceRequest): Promise<unknown> };
    }
  }
}

export type Env = Cloudflare.Env;
