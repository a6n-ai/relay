ALTER TABLE `sending_domain` ADD `created_by_relay` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sending_domain` ADD `verified_at` integer;
--> statement-breakpoint
UPDATE `sending_domain` SET `verified_at` = `updated_at` WHERE `status` = 'verified';
