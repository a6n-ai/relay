CREATE TYPE "public"."mailbox_direction" AS ENUM('out', 'in');--> statement-breakpoint
CREATE TYPE "public"."mailbox_origin" AS ENUM('automatic', 'campaign', 'test');--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "direction" "mailbox_direction" DEFAULT 'out' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "origin" "mailbox_origin" DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
UPDATE "email_mailbox" AS m
SET "origin" = 'campaign'
FROM "notification_outbox" AS o
WHERE m."outbox_id" = o."id" AND o."campaign_id" IS NOT NULL;
