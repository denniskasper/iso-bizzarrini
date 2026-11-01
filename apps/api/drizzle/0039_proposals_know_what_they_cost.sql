CREATE TABLE "proposal_monthly_costs" (
	"month" text PRIMARY KEY NOT NULL,
	"estimated_cost_micro_usd" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "estimated_cost_micro_usd" integer;