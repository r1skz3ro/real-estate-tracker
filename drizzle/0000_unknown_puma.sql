CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listingId` integer NOT NULL,
	`linkId` integer NOT NULL,
	`runId` integer NOT NULL,
	`type` text NOT NULL,
	`oldPrice` integer,
	`newPrice` integer,
	`readAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linkId`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`runId`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_link_created` ON `events` (`linkId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `events_read` ON `events` (`readAt`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`url` text NOT NULL,
	`portal` text NOT NULL,
	`label` text NOT NULL,
	`fetchMode` text DEFAULT 'http' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lastError` text,
	`lastRunAt` integer,
	`baselinedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linkId` integer NOT NULL,
	`externalId` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`price` integer,
	`currency` text DEFAULT 'PLN' NOT NULL,
	`areaM2` real,
	`pricePerM2` real,
	`location` text,
	`imageUrl` text,
	`firstSeenAt` integer NOT NULL,
	`lastSeenAt` integer NOT NULL,
	`lastRank` integer NOT NULL,
	`removedAt` integer,
	FOREIGN KEY (`linkId`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_link_external` ON `listings` (`linkId`,`externalId`);--> statement-breakpoint
CREATE INDEX `listings_link_removed` ON `listings` (`linkId`,`removedAt`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`runAt1` text DEFAULT '08:00' NOT NULL,
	`runAt2` text DEFAULT '20:00' NOT NULL,
	`lastScheduledAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runLinks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`runId` integer NOT NULL,
	`linkId` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`parsedCount` integer DEFAULT 0 NOT NULL,
	`newCount` integer DEFAULT 0 NOT NULL,
	`priceCount` integer DEFAULT 0 NOT NULL,
	`removedCount` integer DEFAULT 0 NOT NULL,
	`escalated` integer DEFAULT false NOT NULL,
	`error` text,
	`startedAt` integer,
	`finishedAt` integer,
	FOREIGN KEY (`runId`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linkId`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runLinks_run` ON `runLinks` (`runId`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`startedAt` integer NOT NULL,
	`finishedAt` integer,
	FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runs_project_started` ON `runs` (`projectId`,`startedAt`);