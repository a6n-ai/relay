import { pgEnum } from "drizzle-orm/pg-core";

export const notificationChannel = pgEnum("notification_channel", [
  "email", "in_app", "sms", "whatsapp",
]);
