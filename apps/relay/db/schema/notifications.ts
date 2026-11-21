import { makeTenantNotificationTables } from "@relay/engine/schema";
// drizzle-kit only emits CREATE TYPE for enums exported from the schema it reads.
export {
  mailboxDirection,
  mailboxOrigin,
  messageKind,
  notificationChannel,
  outboxStatus,
  suppressionScope,
} from "@relay/engine/schema";
import { campaign } from "./campaigns";
import { tenantMailboxes } from "./mailboxes";
import { tenants } from "./tenants";

export const notificationTables = makeTenantNotificationTables({
  tenants,
  mailboxes: tenantMailboxes,
  campaign,
});

export const {
  notifications,
  notificationOutbox,
  notificationPrefs,
  notificationTemplate,
  messageSuppression,
  emailMailbox,
  emailAttachment,
} = notificationTables;
