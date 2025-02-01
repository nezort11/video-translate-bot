CREATE TABLE `updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`update_id` integer,
	`update_data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `updates_update_id_unique` ON `updates` (`update_id`);