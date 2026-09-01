ALTER TABLE "tenants" ADD COLUMN "mailing_country" text DEFAULT 'CA' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "physical_address" text;--> statement-breakpoint
CREATE TABLE "sending_domains" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verify_token" text NOT NULL,
	"dkim_selector" text DEFAULT 'relay' NOT NULL,
	"dkim_public" text,
	"dkim_private" text,
	"spf_include" text,
	"verified_at" bigint,
	"last_checked_at" bigint,
	"last_error" text,
	CONSTRAINT "sending_domains_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_tenant_domain_unique" ON "sending_domains" USING btree ("tenant_id","domain");--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "email_smtp_settings" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"host" text NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"username" text,
	"password" text,
	"spf_include" text,
	CONSTRAINT "email_smtp_settings_public_id_unique" UNIQUE("public_id")
);
