ALTER TABLE `listings` ADD `postedAt` integer;--> statement-breakpoint
ALTER TABLE `runLinks` ADD `log` text;--> statement-breakpoint
CREATE INDEX `runLinks_link` ON `runLinks` (`linkId`,`id`);