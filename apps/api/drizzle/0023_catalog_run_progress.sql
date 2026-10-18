CREATE TABLE "catalog_run_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"identity" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_run_tavole" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"number" text NOT NULL,
	"tavola_id" uuid,
	"refused" text,
	"finished_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_runs" DROP CONSTRAINT "catalog_runs_state_is_known";--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "spending_limit" double precision;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "spent" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "cost" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "started_by" uuid;--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_run_pages" ADD CONSTRAINT "catalog_run_pages_run_id_catalog_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "catalog_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_run_tavole" ADD CONSTRAINT "catalog_run_tavole_run_id_catalog_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "catalog_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_run_tavole" ADD CONSTRAINT "catalog_run_tavole_tavola_id_tavole_id_fk" FOREIGN KEY ("tavola_id") REFERENCES "tavole"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_run_pages_page_unique" ON "catalog_run_pages" USING btree ("run_id","page");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_run_tavole_number_unique" ON "catalog_run_tavole" USING btree ("run_id","number");--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_started_by_accounts_id_fk" FOREIGN KEY ("started_by") REFERENCES "accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_runs_one_running" ON "catalog_runs" USING btree ("state") WHERE "catalog_runs"."state" = 'running';--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_started_with_a_limit" CHECK ("catalog_runs"."state" = 'estimated' or "catalog_runs"."spending_limit" > 0);--> statement-breakpoint
ALTER TABLE "catalog_runs" ADD CONSTRAINT "catalog_runs_state_is_known" CHECK ("catalog_runs"."state" in ('estimated', 'running', 'finished', 'stopped-at-limit', 'stopped-at-usage-limit', 'failed'));