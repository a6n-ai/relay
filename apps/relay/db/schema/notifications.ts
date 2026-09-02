import { makeTenantNotificationTables } from "@relay/engine/schema";
import { campaign } from "./campaigns";
import { tenants } from "./tenants";

export const notificationTables = makeTenantNotificationTables({
  tenants,
  campaign,
});

export const {
  notifications,
  notificationOutbox,
  notificationPrefs,
  notificationTemplate,
  messageSuppression,
  emailMailbox,
} = notificationTables;
