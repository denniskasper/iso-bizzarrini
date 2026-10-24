ALTER TABLE "catalog_run_actions" DROP CONSTRAINT "catalog_run_actions_action_is_known";--> statement-breakpoint
ALTER TABLE "catalog_run_actions" ADD COLUMN "tavola" text;--> statement-breakpoint
ALTER TABLE "catalog_run_tavole" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_run_tavole" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "catalog_run_tavole" ADD CONSTRAINT "catalog_run_tavole_removed_by_accounts_id_fk" FOREIGN KEY ("removed_by") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_run_actions" ADD CONSTRAINT "catalog_run_actions_action_is_known" CHECK ("catalog_run_actions"."action" in ('started', 'raised', 'continued', 'stopped', 'removed'));