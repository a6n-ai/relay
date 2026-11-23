CREATE TABLE `address` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text NOT NULL,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text,
	`can_send` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "address_email_lower" CHECK("address"."email" = lower(trim("address"."email")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `address_email_unique` ON `address` (`email`);--> statement-breakpoint
CREATE TABLE `sending_domain` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`domain` text NOT NULL,
	`ses_region` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`dkim_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sending_domain_domain_unique` ON `sending_domain` (`domain`);--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`workspace_id` text NOT NULL,
	`day` text NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`delivered` integer DEFAULT 0 NOT NULL,
	`bounced` integer DEFAULT 0 NOT NULL,
	`inbound` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `day`)
);
--> statement-breakpoint
CREATE TABLE `workspace_profile` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`mailing_country` text DEFAULT 'CA' NOT NULL,
	`physical_address` text,
	`monthly_message_quota` integer DEFAULT 10000 NOT NULL,
	`default_ses_region` text DEFAULT 'ap-south-1' NOT NULL,
	`do_schema_version` integer DEFAULT 0 NOT NULL,
	`do_migrate_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
