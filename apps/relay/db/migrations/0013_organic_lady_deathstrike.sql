ALTER TABLE "organization" ALTER COLUMN "monthly_message_quota" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "max_apps" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "self_serve" SET DEFAULT true;