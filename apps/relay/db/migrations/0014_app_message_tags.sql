CREATE TABLE "app_message_tags" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "app_message_tags_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "app_message_tags_tenant_slug_unique" ON "app_message_tags" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "app_message_tags_tenant_idx" ON "app_message_tags" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "app_message_tags" ADD CONSTRAINT "app_message_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TABLE IF EXISTS "mailbox_conversation_tags";
