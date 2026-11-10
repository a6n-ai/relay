-- Relay schema, squashed from 0000-0015 before the first release. Hand-written parts: the id generator
-- and current_app_id() up top (column defaults use them), the relay_work triggers at the end.
CREATE SEQUENCE IF NOT EXISTS "id_seq";--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_id(OUT result bigint) RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE our_epoch bigint := 1735689600000; seq_id bigint; now_millis bigint;
BEGIN
  SELECT nextval('id_seq') % 8388608 INTO seq_id;
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) INTO now_millis;
  result := (now_millis - our_epoch) << 23;
  result := result | seq_id;
END;
$fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT NULL::bigint $fn$;--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."audit_operation" AS ENUM('create', 'update', 'delete', 'read', 'login', 'logout', 'login_failed');--> statement-breakpoint
CREATE TYPE "public"."campaign_locale" AS ENUM('en');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'completed', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('purchase', 'express_optin', 'event_signup', 'import_other');--> statement-breakpoint
CREATE TYPE "public"."mailbox_direction" AS ENUM('out', 'in');--> statement-breakpoint
CREATE TYPE "public"."mailbox_origin" AS ENUM('automatic', 'campaign', 'test', 'manual');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('transactional', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('all', 'marketing');--> statement-breakpoint
CREATE TABLE "app" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text DEFAULT 'Relay' NOT NULL,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	CONSTRAINT "app_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"user_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"password_set" boolean DEFAULT true NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"bauth_created_at" timestamp DEFAULT now() NOT NULL,
	"bauth_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verification_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"entity" text NOT NULL,
	"entity_public_id" text NOT NULL,
	"operation" "audit_operation" NOT NULL,
	"changes" jsonb,
	CONSTRAINT "audit_log_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text DEFAULT 'messages:write' NOT NULL,
	"channels" text[] DEFAULT '{"email"}' NOT NULL,
	"revoked_at" bigint,
	CONSTRAINT "api_keys_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"mailing_country" text DEFAULT 'CA' NOT NULL,
	"physical_address" text,
	"monthly_message_quota" integer DEFAULT 10000 NOT NULL,
	"mailbox_seat_quota" integer DEFAULT 5 NOT NULL,
	CONSTRAINT "tenants_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
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
	"from_email" text,
	"from_name" text,
	CONSTRAINT "email_smtp_settings_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
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
);
--> statement-breakpoint
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
);
--> statement-breakpoint
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
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"channels" "notification_channel"[] NOT NULL,
	"audience" jsonb NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" bigint,
	"sent_at" bigint,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"system_key" text,
	CONSTRAINT "campaign_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_content" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"campaign_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" "campaign_locale" NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"html" text,
	"text" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"provider_template_id" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "campaign_content_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_tenant" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"campaign_id" bigint NOT NULL,
	"tenant_id" bigint NOT NULL,
	CONSTRAINT "campaign_tenant_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "contact_list" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"consent_source" "consent_source" NOT NULL,
	"consent_at" bigint NOT NULL,
	"consent_note" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"segment_def" jsonb,
	CONSTRAINT "contact_list_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "contact_list_member" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"list_id" bigint NOT NULL,
	"email" text,
	"phone" text,
	"name" text,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unsubscribed_at" bigint,
	CONSTRAINT "contact_list_member_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
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
	"direction" "mailbox_direction" DEFAULT 'out' NOT NULL,
	"origin" "mailbox_origin" DEFAULT 'automatic' NOT NULL,
	"rfc_message_id" text,
	"in_reply_to" text,
	"references" text,
	"thread_id" text,
	CONSTRAINT "email_mailbox_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "message_suppression" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"tenant_id" bigint NOT NULL,
	"address" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"scope" "suppression_scope" DEFAULT 'all' NOT NULL,
	"reason" text NOT NULL,
	"source" text,
	CONSTRAINT "message_suppression_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"recipient_id" bigint,
	"recipient_external_id" text,
	"recipient_email" text,
	"recipient_phone" text,
	"channel" "notification_channel" NOT NULL,
	"kind" "message_kind" DEFAULT 'transactional' NOT NULL,
	"event" text,
	"campaign_id" bigint,
	"payload" jsonb NOT NULL,
	"status" "notification_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"dedupe_key" text,
	CONSTRAINT "notification_outbox_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"external_user_id" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"kind" "message_kind" DEFAULT 'transactional' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"consent_source" text,
	"consent_at" bigint,
	CONSTRAINT "notification_prefs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_template" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"tenant_id" bigint NOT NULL,
	"event" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"html" text,
	"text" text,
	"provider_template_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_template_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"tenant_id" bigint NOT NULL,
	"external_user_id" text,
	"event" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" bigint,
	CONSTRAINT "notifications_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
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
);
--> statement-breakpoint
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
);
--> statement-breakpoint
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
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_email_senders" ADD CONSTRAINT "tenant_email_senders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_mailboxes" ADD CONSTRAINT "tenant_mailboxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_message_tags" ADD CONSTRAINT "app_message_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD CONSTRAINT "campaign_tenant_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_tenant" ADD CONSTRAINT "campaign_tenant_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_member" ADD CONSTRAINT "contact_list_member_list_id_contact_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD CONSTRAINT "email_mailbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_mailbox" ADD CONSTRAINT "email_mailbox_outbox_id_notification_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."notification_outbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_suppression" ADD CONSTRAINT "message_suppression_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_automation" ADD CONSTRAINT "list_automation_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_automation" ADD CONSTRAINT "list_automation_list_id_contact_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_webhook" ADD CONSTRAINT "tenant_webhook_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_webhook_delivery" ADD CONSTRAINT "tenant_webhook_delivery_webhook_id_tenant_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."tenant_webhook"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_webhook_delivery" ADD CONSTRAINT "tenant_webhook_delivery_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_unique" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_tenant_domain_unique" ON "sending_domains" USING btree ("tenant_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_email_senders_tenant_email_unique" ON "tenant_email_senders" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_mailboxes_tenant_email_unique" ON "tenant_mailboxes" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "app_message_tags_tenant_slug_unique" ON "app_message_tags" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "app_message_tags_tenant_idx" ON "app_message_tags" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "campaign_status_scheduled_idx" ON "campaign" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_system_key_idx" ON "campaign" USING btree ("system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_content_key_idx" ON "campaign_content" USING btree ("campaign_id","channel","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_tenant_campaign_id_unique" ON "campaign_tenant" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_email_idx" ON "contact_list_member" USING btree ("list_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_phone_idx" ON "contact_list_member" USING btree ("list_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "email_mailbox_outbox_uidx" ON "email_mailbox" USING btree ("outbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_mailbox_rfc_message_id_uidx" ON "email_mailbox" USING btree ("rfc_message_id");--> statement-breakpoint
CREATE INDEX "email_mailbox_created_idx" ON "email_mailbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_mailbox_tenant_idx" ON "email_mailbox" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_mailbox_thread_idx" ON "email_mailbox" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_suppression_tenant_address_channel_scope_idx" ON "message_suppression" USING btree ("tenant_id","address","channel","scope");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("kind","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_tenant_idx" ON "notification_outbox" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_idx" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_campaign_idx" ON "notification_outbox" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_outbox_provider_message_idx" ON "notification_outbox" USING btree ("provider_message_id") WHERE "notification_outbox"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_tenant_ext_channel_kind_idx" ON "notification_prefs" USING btree ("tenant_id","external_user_id","channel","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_template_tenant_key_idx" ON "notification_template" USING btree ("tenant_id","event","channel","locale");--> statement-breakpoint
CREATE INDEX "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "list_automation_tenant_event_list_idx" ON "list_automation" USING btree ("tenant_id","trigger_event","list_id");--> statement-breakpoint
CREATE INDEX "tenant_webhook_tenant_idx" ON "tenant_webhook" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_webhook_delivery_due_idx" ON "tenant_webhook_delivery" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT id FROM app ORDER BY id LIMIT 1 $fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION relay_notify_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('relay_work', TG_TABLE_NAME);
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER notification_outbox_relay_work AFTER INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION relay_notify_work();--> statement-breakpoint
CREATE TRIGGER tenant_webhook_delivery_relay_work AFTER INSERT ON tenant_webhook_delivery FOR EACH ROW EXECUTE FUNCTION relay_notify_work();
