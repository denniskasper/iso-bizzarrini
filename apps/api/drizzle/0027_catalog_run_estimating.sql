ALTER TABLE "catalog_runs" DROP CONSTRAINT "catalog_runs_state_is_known";--> statement-breakpoint
ALTER TABLE "catalog_runs" DROP CONSTRAINT "catalog_runs_started_with_a_limit";--> statement-breakpoint
DROP INDEX "catalog_runs_one_running";--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "pages_estimated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_runs_one_reading" ON "catalog_runs" USING btree (("state" in ('estimating', 'running'))) WHERE "catalog_runs"."state" in ('estimating', 'running');--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_state_is_known" CHECK ("catalog_runs"."state" in ('estimating', 'estimated', 'running', 'finished', 'stopped-at-limit', 'stopped-at-usage-limit', 'stopped-after-failures', 'stopped-by-administrator', 'failed'));--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_started_with_a_limit" CHECK ("catalog_runs"."state" in ('estimating', 'estimated') or "catalog_runs"."spending_limit" > 0);