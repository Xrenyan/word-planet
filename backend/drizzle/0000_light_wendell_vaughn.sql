CREATE TABLE `vault_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL,
	CONSTRAINT "positive_count" CHECK("vault_rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE INDEX `vault_rate_limits_expiry` ON `vault_rate_limits` (`reset_at`);--> statement-breakpoint
CREATE TABLE `vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`iv` text NOT NULL,
	`ciphertext` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "positive_revision" CHECK("vaults"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `vaults_expiry` ON `vaults` (`expires_at`);