CREATE TABLE `knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`author_email` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`repo_id` text,
	`trigger_text` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`session_id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`url` text NOT NULL,
	`branch` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`files_changed` integer NOT NULL,
	`additions` integer NOT NULL,
	`deletions` integer NOT NULL,
	`commits` integer DEFAULT 1 NOT NULL,
	`state` text NOT NULL,
	`head_sha` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text NOT NULL,
	`setup_command` text,
	`added_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`removed_at` text
);
--> statement-breakpoint
CREATE INDEX `repos_full_name` ON `repos` (`full_name`);--> statement-breakpoint
CREATE TABLE `session_knowledge` (
	`session_id` text NOT NULL,
	`knowledge_id` text NOT NULL,
	`title` text NOT NULL,
	PRIMARY KEY(`session_id`, `knowledge_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`owner_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`repo_id` text NOT NULL,
	`repo_name` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`tier` text NOT NULL,
	`status` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`collaborate` integer DEFAULT false NOT NULL,
	`thread_id` text,
	`sandbox_id` text,
	`base_sha` text,
	`branch` text,
	`error` text,
	`transcript` text DEFAULT '[]' NOT NULL,
	`turns` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`last_activity_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_owner` ON `sessions` (`owner_id`);--> statement-breakpoint
CREATE INDEX `sessions_thread` ON `sessions` (`thread_id`);--> statement-breakpoint
CREATE TABLE `steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`author_email` text,
	`text` text,
	`command` text,
	`exit_code` integer,
	`output` text,
	`path` text,
	`additions` integer,
	`deletions` integer,
	`files` text,
	`pending` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `steps_session` ON `steps` (`session_id`,`id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
