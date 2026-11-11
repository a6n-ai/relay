ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "platform_role" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "monthly_message_quota" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "max_apps" integer DEFAULT 0 NOT NULL;
