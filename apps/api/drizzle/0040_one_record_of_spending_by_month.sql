CREATE TABLE "monthly_spending" (
	"month" text NOT NULL,
	"purpose" text NOT NULL,
	"billed" boolean NOT NULL,
	"estimated_cost_micro_usd" bigint NOT NULL,
	CONSTRAINT "monthly_spending_month_purpose_billed_pk" PRIMARY KEY("month","purpose","billed"),
	CONSTRAINT "monthly_spending_purpose_is_known" CHECK ("monthly_spending"."purpose" in ('proposal-conversations'))
);
--> statement-breakpoint
INSERT INTO "monthly_spending" ("month", "purpose", "billed", "estimated_cost_micro_usd")
SELECT "month", 'proposal-conversations', true, "estimated_cost_micro_usd" FROM "proposal_monthly_costs";--> statement-breakpoint
DROP TABLE "proposal_monthly_costs" CASCADE;
