ALTER TABLE "email_mailbox" ADD COLUMN "rfc_message_id" text;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "references" text;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "thread_id" text;--> statement-breakpoint
CREATE INDEX "email_mailbox_thread_idx" ON "email_mailbox" USING btree ("thread_id");
