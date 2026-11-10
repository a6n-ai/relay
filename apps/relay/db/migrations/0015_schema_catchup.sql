-- Catch-up: columns and indexes declared in the schema that no earlier migration created.
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "system_key" text;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "message_suppression" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_system_key_idx" ON "campaign" USING btree ("system_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_suppression_tenant_address_channel_scope_idx" ON "message_suppression" USING btree ("tenant_id","address","channel","scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_due_idx" ON "notification_outbox" USING btree ("kind","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_tenant_idx" ON "notification_outbox" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_campaign_idx" ON "notification_outbox" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_provider_message_idx" ON "notification_outbox" USING btree ("provider_message_id") WHERE "notification_outbox"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_prefs_tenant_ext_channel_kind_idx" ON "notification_prefs" USING btree ("tenant_id","external_user_id","channel","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_template_tenant_key_idx" ON "notification_template" USING btree ("tenant_id","event","channel","locale");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");--> statement-breakpoint
