ALTER TABLE `address` ADD `owner_user_id` text;--> statement-breakpoint
ALTER TABLE `address` ADD `closed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `address_owner_user` ON `address` (`workspace_id`,`owner_user_id`) WHERE "address"."owner_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_profile` ADD `admins_read_personal` integer DEFAULT true NOT NULL;