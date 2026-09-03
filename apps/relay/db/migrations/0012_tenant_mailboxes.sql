ALTER TABLE "tenants" ADD COLUMN "mailbox_seat_quota" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
CREATE TABLE "tenant_mailboxes" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"local_part" text NOT NULL,
	"domain" text NOT NULL,
	"email" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "tenant_mailboxes_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_mailboxes_tenant_email_unique" ON "tenant_mailboxes" USING btree ("tenant_id","email");--> statement-breakpoint
ALTER TABLE "tenant_mailboxes" ADD CONSTRAINT "tenant_mailboxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
