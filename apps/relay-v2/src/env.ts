import type { ClientDO } from "./do/client-do";

export type SendJob = { workspaceId: string; messageId: string };

// Global so that cloudflare:workers `env` is typed with the same bindings.
declare global {
  namespace Cloudflare {
    interface Env {
      CENTRAL: D1Database;
      CLIENT: DurableObjectNamespace<ClientDO>;
      MAIL: R2Bucket;
      SEND: Queue<SendJob>;
      BETTER_AUTH_SECRET: string;
      BETTER_AUTH_URL: string;
      OTP_MAILER?: "memory" | "console";
      SEED_SECRET?: string;
    }
  }
}

export type Env = Cloudflare.Env;
