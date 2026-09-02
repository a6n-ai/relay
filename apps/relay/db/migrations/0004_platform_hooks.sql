CREATE TABLE "tenant_webhook" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tenant_webhook_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE TABLE "tenant_webhook_delivery" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"webhook_id" bigint NOT NULL,
	"tenant_id" bigint NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"last_error" text,
	"response_status" integer,
	CONSTRAINT "tenant_webhook_delivery_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE TABLE "list_automation" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"trigger_event" text NOT NULL,
	"list_id" bigint NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "list_automation_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
ALTER TABLE "tenant_webhook" ADD CONSTRAINT "tenant_webhook_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_webhook_delivery" ADD CONSTRAINT "tenant_webhook_delivery_webhook_id_tenant_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."tenant_webhook"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_webhook_delivery" ADD CONSTRAINT "tenant_webhook_delivery_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_automation" ADD CONSTRAINT "list_automation_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_automation" ADD CONSTRAINT "list_automation_list_id_contact_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_webhook_tenant_idx" ON "tenant_webhook" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_webhook_delivery_due_idx" ON "tenant_webhook_delivery" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "list_automation_tenant_event_list_idx" ON "list_automation" USING btree ("tenant_id","trigger_event","list_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION relay_notify_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('relay_work', TG_TABLE_NAME);
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER notification_outbox_relay_work AFTER INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION relay_notify_work();--> statement-breakpoint
CREATE TRIGGER tenant_webhook_delivery_relay_work AFTER INSERT ON tenant_webhook_delivery FOR EACH ROW EXECUTE FUNCTION relay_notify_work();
