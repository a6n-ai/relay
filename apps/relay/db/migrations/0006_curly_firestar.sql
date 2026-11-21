ALTER TABLE "tenant_mailboxes" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "tenant_mailboxes" ADD COLUMN "verified_at" bigint;--> statement-breakpoint
ALTER TABLE "tenant_mailboxes" ADD COLUMN "can_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "mailbox_id" bigint;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD CONSTRAINT "email_mailbox_mailbox_id_tenant_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."tenant_mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_mailbox_mailbox_idx" ON "email_mailbox" USING btree ("mailbox_id");