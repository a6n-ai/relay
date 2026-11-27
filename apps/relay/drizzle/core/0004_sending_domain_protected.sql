ALTER TABLE `sending_domain` ADD `protected` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `sending_domain` SET `protected` = 1 WHERE `domain` IN ('a6n.ai', 'tiffingrab.ca');
