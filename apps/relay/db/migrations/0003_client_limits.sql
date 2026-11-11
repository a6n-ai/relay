ALTER TABLE "organization" ADD COLUMN "monthly_message_quota" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "max_apps" integer DEFAULT 0 NOT NULL;
