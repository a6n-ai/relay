ALTER TABLE "tenants" ADD COLUMN "monthly_message_quota" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "channels" text[] DEFAULT ARRAY['email']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "email_smtp_settings" ADD COLUMN "from_email" text;--> statement-breakpoint
ALTER TABLE "email_smtp_settings" ADD COLUMN "from_name" text;--> statement-breakpoint
CREATE TABLE "tenant_email_senders" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"verified_at" bigint,
	CONSTRAINT "tenant_email_senders_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_email_senders_tenant_email_unique" ON "tenant_email_senders" USING btree ("tenant_id","email");--> statement-breakpoint
ALTER TABLE "tenant_email_senders" ADD CONSTRAINT "tenant_email_senders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
