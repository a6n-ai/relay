import type { ClientDO } from "./do/client-do";

// finalize: the SES send already happened; the job only records the SES id and never calls SES.
export type SendJob =
  | { kind?: "send"; workspaceId: string; messageId: string }
  | { kind: "finalize"; workspaceId: string; messageId: string; sesMessageId: string };

// Global so that cloudflare:workers `env` is typed with the same bindings.
declare global {
  namespace Cloudflare {
    interface Env {
      SECURITY_DB: D1Database;
      CORE_DB: D1Database;
      CLIENT: DurableObjectNamespace<ClientDO>;
      MAIL: R2Bucket;
      SEND: Queue<SendJob>;
      API_LIMIT: RateLimit;
      BETTER_AUTH_SECRET: string;
      BETTER_AUTH_URL: string;
      OTP_MAILER?: "memory" | "console";
      INVITE_MAILER?: "memory" | "console";
      SEED_SECRET?: string;
      INTERNAL_SECRET?: string;
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
      SES_EVENT_TOPIC_ARNS?: string;
      SYSTEM_FROM_EMAIL?: string;
      SYSTEM_FROM_NAME?: string;
      SYSTEM_SES_REGION?: string;
      SES_TRANSPORT?: "memory";
    }
  }
}

export type Env = Cloudflare.Env;
