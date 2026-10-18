CREATE TABLE "catalog_run_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"action" text NOT NULL,
	"by" uuid,
	"at" timestamp with time zone NOT NULL,
	"spending_limit" double precision,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "catalog_run_actions_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "catalog_run_actions_action_is_known" CHECK ("catalog_run_actions"."action" in ('started', 'raised', 'continued', 'stopped'))
);
--> statement-breakpoint
ALTER TABLE "catalog_runs" DROP CONSTRAINT "catalog_runs_state_is_known";--> statement-breakpoint
ALTER TABLE "catalog_run_tavole" ADD COLUMN "machine_translations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "costs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_run_actions" ADD CONSTRAINT "catalog_run_actions_run_id_catalog_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "catalog_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_run_actions" ADD CONSTRAINT "catalog_run_actions_by_accounts_id_fk" FOREIGN KEY ("by") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_run_actions_run_id_index" ON "catalog_run_actions" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_state_is_known" CHECK ("catalog_runs"."state" in ('estimated', 'running', 'finished', 'stopped-at-limit', 'stopped-at-usage-limit', 'stopped-after-failures', 'stopped-by-administrator', 'failed'));--> statement-breakpoint
UPDATE "catalog_runs" SET "costs" = jsonb_build_array("cost") WHERE "cost" IS NOT NULL;--> statement-breakpoint
INSERT INTO "catalog_run_actions" ("run_id", "action", "by", "at", "spending_limit") SELECT "id", 'started', "started_by", "started_at", "spending_limit" FROM "catalog_runs" WHERE "started_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_runs" DROP COLUMN "cost";