CREATE TABLE "mailbox_inbound_failure" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"raw_key" text NOT NULL,
	"envelope_from" text NOT NULL,
	"envelope_to" text NOT NULL,
	"auth_results" text,
	"received_at" bigint NOT NULL,
	"error" text,
	"attempts" integer NOT NULL,
	"tenant_id" bigint,
	"organization_id" text,
	CONSTRAINT "mailbox_inbound_failure_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "email_attachment" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"mailbox_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_id" text,
	"storage_key" text NOT NULL,
	CONSTRAINT "email_attachment_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "raw_key" text;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "auth_results" text;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD COLUMN "sent_at" bigint;--> statement-breakpoint
ALTER TABLE "mailbox_inbound_failure" ADD CONSTRAINT "mailbox_inbound_failure_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_inbound_failure" ADD CONSTRAINT "mailbox_inbound_failure_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachment" ADD CONSTRAINT "email_attachment_mailbox_id_email_mailbox_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."email_mailbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_inbound_failure_raw_key_uidx" ON "mailbox_inbound_failure" USING btree ("raw_key");--> statement-breakpoint
CREATE INDEX "mailbox_inbound_failure_org_idx" ON "mailbox_inbound_failure" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "email_attachment_mailbox_idx" ON "email_attachment" USING btree ("mailbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_attachment_storage_key_uidx" ON "email_attachment" USING btree ("storage_key");