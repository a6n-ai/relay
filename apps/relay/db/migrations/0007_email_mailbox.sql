CREATE TABLE "email_mailbox" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint,
	"outbox_id" bigint,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "email_mailbox_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "email_mailbox_outbox_uidx" ON "email_mailbox" USING btree ("outbox_id");--> statement-breakpoint
CREATE INDEX "email_mailbox_created_idx" ON "email_mailbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_mailbox_tenant_idx" ON "email_mailbox" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD CONSTRAINT "email_mailbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD CONSTRAINT "email_mailbox_outbox_id_notification_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."notification_outbox"("id") ON DELETE no action ON UPDATE no action;
